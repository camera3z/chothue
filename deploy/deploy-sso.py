#!/usr/bin/env python3
"""Build a staged Rentbook release with existing public config, then publish static files.

Run as root from a fresh pinned checkout. Never edits the installed source,
Supabase data, Nginx configuration, or the existing .env.local.
"""
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

DOMAIN = 'thue.filezuno.net'
PROJECT = 'lkwnbvervvgbbvfosohi'


class DeployError(Exception):
    pass


def detect_root(config):
    lexer = shlex.shlex(config, posix=True, punctuation_chars='{};')
    lexer.whitespace_split = True
    tokens = []
    for token in lexer:
        tokens.extend(list(token) if token and set(token) <= set('{};') else [token])
    position = 0

    def block(nested=False):
        nonlocal position
        result, head = [], []
        while position < len(tokens):
            token = tokens[position]
            position += 1
            if token == ';':
                result.append((head, None)); head = []
            elif token == '{':
                result.append((head, block(True))); head = []
            elif token == '}':
                if not nested or head:
                    raise DeployError('Không đọc được cấu trúc Nginx; chưa thay đổi website.')
                return result
            else:
                head.append(token)
        if nested or head:
            raise DeployError('Cấu hình Nginx chưa đầy đủ; chưa thay đổi website.')
        return result

    sites = []

    def walk(nodes):
        for head, children in nodes:
            if head == ['server'] and children is not None:
                names = [part for args, child in children if child is None and args[:1] == ['server_name'] for part in args[1:]]
                roots = [args[1] for args, child in children if child is None and args[:1] == ['root'] and len(args) == 2]
                sites.append((names, roots))
            elif children is not None:
                walk(children)

    walk(block())
    roots = {root for names, values in sites if DOMAIN in names for root in values}
    if len(roots) != 1:
        raise DeployError('Không xác định được duy nhất thư mục web của thue.filezuno.net; chưa thay đổi gì.')
    raw = roots.pop()
    if '$' in raw or not Path(raw).is_absolute():
        raise DeployError('Nginx dùng root động; cần kiểm tra riêng trước khi triển khai.')
    root = Path(raw).resolve()
    for names, values in sites:
        if any('$' not in value and Path(value).is_absolute() and Path(value).resolve() == root for value in values):
            if any(name not in (DOMAIN, 'www.' + DOMAIN) for name in names):
                raise DeployError('Thư mục web được dùng chung với hostname khác; không ghi đè.')
    return root


def build_settings(path):
    values = {}
    for line in path.read_text().splitlines():
        if not re.match(r'^\s*(?:export\s+)?VITE_SUPABASE_(URL|ANON_KEY)\s*=', line):
            continue
        try:
            fields = shlex.split(line, comments=True)
        except ValueError:
            raise DeployError('Cấu hình Supabase có dấu nháy không hợp lệ.') from None
        if fields[:1] == ['export']:
            fields = fields[1:]
        if len(fields) != 1:
            raise DeployError('Cấu hình Supabase không đúng định dạng; không in giá trị khóa.')
        key, _, value = fields[0].partition('=')
        if key in values:
            raise DeployError('Cấu hình Supabase bị trùng; dừng để kiểm tra.')
        values[key] = value
    if values.get('VITE_SUPABASE_URL', '').rstrip('/') != f'https://{PROJECT}.supabase.co':
        raise DeployError('URL Supabase chưa khớp dự án Rentbook; không triển khai.')
    key = values.get('VITE_SUPABASE_ANON_KEY', '')
    public = key.startswith('sb_publishable_') and len(key) > 25
    if not public:
        try:
            encoded = key.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
            public = claims.get('role') == 'anon' and claims.get('ref', PROJECT) == PROJECT
        except (ValueError, IndexError, AttributeError):
            public = False
    if not public or any(c.isspace() for c in key):
        raise DeployError('Cần anon/publishable key. Không đưa secret/service_role vào bản build.')
    values['VITE_FILEZUNO_SSO'] = '1'
    return values


def find_node(source):
    candidates = []
    if shutil.which('node'):
        candidates.append(Path(shutil.which('node')))
    for base in (source / '.nvm', Path('/root/.nvm')):
        try:
            candidates.extend(sorted(base.glob('versions/node/*/bin/node'), reverse=True))
        except OSError:
            continue
    for node in candidates:
        try:
            version = subprocess.check_output([str(node), '--version'], text=True).strip()
            if int(version.lstrip('v').split('.')[0]) < 22:
                continue
            env = {**os.environ, 'PATH': str(node.parent) + os.pathsep + os.environ.get('PATH', '')}
            npm = shutil.which('npm', path=env['PATH'])
            if npm:
                return env, npm
        except (OSError, ValueError, subprocess.CalledProcessError):
            continue
    raise DeployError('Chưa tìm thấy Node.js 22+ và npm, kể cả trong /opt/chothue/.nvm. Chưa thay đổi website.')


class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.paths = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        value = attrs.get('src') if tag == 'script' else attrs.get('href') if tag == 'link' and attrs.get('rel') == 'stylesheet' else None
        if value and re.fullmatch(r'/assets/[A-Za-z0-9_./-]+', value) and '..' not in value:
            self.paths.append(value)


def check_served(root, fetch):
    expected = (root / 'index.html').read_bytes()
    if hashlib.sha256(fetch('/')).digest() != hashlib.sha256(expected).digest():
        raise DeployError('Nginx chưa trả đúng index.html từ thư mục đã xác định.')
    assets = Assets(); assets.feed(expected.decode())
    if not assets.paths:
        raise DeployError('Không thấy JS/CSS Vite trong index.html.')
    for url in assets.paths:
        path = root / url.lstrip('/')
        if path.is_symlink() or not path.is_file() or hashlib.sha256(fetch(url)).digest() != hashlib.sha256(path.read_bytes()).digest():
            raise DeployError('Kiểm tra tài nguyên JS/CSS qua Nginx thất bại.')


def publish(dist, root):
    paths = sorted(dist.rglob('*'))
    if not (dist / 'index.html').is_file() or not (dist / 'assets').is_dir():
        raise DeployError('Bản build không đầy đủ.')
    for source in paths:
        if source.is_symlink():
            raise DeployError('Không triển khai bản build có symlink.')
        relative = source.relative_to(dist)
        target = root / relative
        for parent in (target, *target.parents):
            if parent == root:
                break
            if parent.is_symlink():
                raise DeployError('Đích có symlink bên trong; chưa ghi tệp đó.')
    # Assets first, HTML last; old hashed assets remain for already-open tabs.
    for source in sorted((p for p in paths if p.is_file()), key=lambda p: p.name == 'index.html'):
        target = root / source.relative_to(dist)
        missing = []
        directory = target.parent
        while not directory.exists():
            missing.append(directory); directory = directory.parent
        for directory in reversed(missing):
            directory.mkdir(); directory.chmod(0o755)
        fd, temporary = tempfile.mkstemp(prefix='.rentbook-', dir=target.parent)
        try:
            with os.fdopen(fd, 'wb') as output:
                output.write(source.read_bytes())
            os.chmod(temporary, 0o644)
            os.replace(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)


def deploy(dist, root, backup, verify):
    shutil.copytree(root, backup, symlinks=True)
    try:
        publish(dist, root)
        verify(root)
    except BaseException:
        publish(backup, root)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('/opt/chothue'))
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise DeployError('Chạy bằng root trên VPS.')
    source = args.source.resolve()
    checkout = Path(__file__).resolve().parents[1]
    if checkout == source or not (checkout / 'src/main.js').is_file():
        raise DeployError('Chạy từ checkout staging mới, không chạy trong /opt/chothue.')
    if 'custom:filezuno' not in (checkout / 'src/main.js').read_text():
        raise DeployError('Checkout chưa có đăng nhập Filezuno.')
    settings = build_settings(source / '.env.local')
    if not shutil.which('nginx') or not shutil.which('curl'):
        raise DeployError('Cần nginx và curl hiện có trên VPS. Chưa thay đổi website.')
    config = subprocess.run(['nginx', '-T'], capture_output=True, text=True, check=True).stdout
    root = detect_root(config)
    if root == source or root == Path('/') or not (root / 'index.html').is_file() or not (root / 'assets').is_dir():
        raise DeployError('Đích chưa phải thư mục bản build Vite đang chạy; không ghi đè.')
    if (root / '.env.local').exists() or (root / 'package.json').exists():
        raise DeployError('Thư mục Nginx chứa mã nguồn/cấu hình; cần kiểm tra riêng.')
    if any(path.is_symlink() for path in root.rglob('*')):
        raise DeployError('Bản web hiện tại có symlink bên trong; cần kiểm tra riêng trước khi thay đổi.')
    env, npm = find_node(source)

    def fetch(url):
        return subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '20',
            '--resolve', f'{DOMAIN}:443:127.0.0.1', f'https://{DOMAIN}{url}'], stderr=subprocess.PIPE)

    print('Đang kiểm tra bản đang chạy qua HTTPS nội bộ...', flush=True)
    check_served(root, fetch)
    print('Thư mục web đã xác minh:', root, flush=True)
    # Build in a private directory, leaving both installed source and .env.local intact.
    stage = Path(tempfile.mkdtemp(prefix='rentbook-sso-release-', dir='/root'))
    build = stage / 'build'
    shutil.copytree(checkout, build, ignore=shutil.ignore_patterns('.git', 'node_modules', 'dist', '.env', '.env.*', 'test-results', '__pycache__'))
    env_file = build / '.env.local'
    env_file.write_text(''.join(f'{k}={v}\n' for k, v in settings.items())); env_file.chmod(0o600)
    env.update(settings)
    print('Đang cài dependencies và build Rentbook với SSO...', flush=True)
    subprocess.run([npm, 'ci'], cwd=build, env=env, check=True)
    subprocess.run([npm, 'run', 'build'], cwd=build, env=env, check=True)
    dist = build / 'dist'
    js = list((dist / 'assets').glob('*.js'))
    def contains_sso(path):
        compiled = re.sub(r'\\u([0-9a-fA-F]{4})', lambda match: chr(int(match[1], 16)), path.read_text())
        return 'custom:filezuno' in compiled and 'Đăng nhập bằng Filezuno' in compiled

    if not js or not any(contains_sso(p) for p in js):
        raise DeployError('Bản build chưa chứa nút đăng nhập Filezuno; không phát hành.')
    backup = stage / 'previous-web'
    print('Đang sao lưu và phát hành giao diện...', flush=True)
    try:
        deploy(dist, root, backup, lambda target: check_served(target, fetch))
    except BaseException:
        print('Phát hành chưa qua kiểm tra; đã yêu cầu khôi phục tệp cũ từ:', backup, flush=True)
        raise
    print('THÀNH CÔNG: Rentbook đã cập nhật, index và JS/CSS được xác minh qua Nginx HTTPS.')
    print('Bản sao giao diện cũ:', backup)
    print('Không thay source /opt/chothue, .env.local, Nginx, dữ liệu hoặc license Supabase.')
    print(f'Mở https://{DOMAIN}, Ctrl+F5, đăng xuất Rentbook rồi chọn Đăng nhập bằng Filezuno.')


if __name__ == '__main__':
    try:
        main()
    except DeployError as error:
        print(str(error), file=sys.stderr); sys.exit(1)
    except (OSError, subprocess.SubprocessError, ValueError):
        print('Chưa hoàn tất: kiểm tra bước vừa in phía trên. Không gửi nội dung .env.local hoặc khóa.', file=sys.stderr)
        sys.exit(1)
