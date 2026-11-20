#!/usr/bin/env python3
"""Build a per-user Windows installer with NSIS on Windows or Linux.

Only the fixed launcher, icon and user guide enter the installer. No web source,
environment file, user data, API key or license key is bundled.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess


def source_fingerprint(root):
    digest = hashlib.sha256()
    for name in ['browser.nsh', 'launcher.nsi', 'installer.nsi', 'WINDOWS-USER.txt', 'assets/rentbook.ico', 'build_windows.py']:
        digest.update(name.encode() + b'\0'); digest.update((Path(root) / name).read_bytes())
    return digest.hexdigest()


def inspect_executable(path):
    data = Path(path).read_bytes()
    if len(data) < 256 or data[:2] != b'MZ':
        raise ValueError('Output is not a Windows executable.')
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if pe + 160 > len(data) or data[pe:pe + 4] != b'PE\0\0':
        raise ValueError('Invalid Windows PE header.')
    machine = struct.unpack_from('<H', data, pe + 4)[0]
    optional = pe + 24
    magic = struct.unpack_from('<H', data, optional)[0]
    if machine != 0x14c or magic != 0x10b or struct.unpack_from('<H', data, optional + 68)[0] != 2:
        raise ValueError('Expected a Windows GUI x86 launcher/installer.')
    certificate_offset, certificate_size = struct.unpack_from('<II', data, optional + 96 + 4 * 8)
    return {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'authenticode_status': 'present-unverified' if certificate_offset and certificate_size else 'unsigned'}


def build(version, compiler, destination):
    if not re.fullmatch(r'\d{1,4}\.\d{1,4}\.\d{1,4}', version):
        raise ValueError('Use a three-part numeric version.')
    root = Path(__file__).resolve().parent
    destination = Path(destination).resolve(); destination.mkdir(parents=True, exist_ok=True)
    compiler = str(Path(compiler).resolve())
    prefix = '/' if os.name == 'nt' else '-'
    compiler_version = subprocess.check_output([compiler, prefix + 'VERSION'], text=True).strip()
    for source in ['launcher.nsi', 'installer.nsi']:
        subprocess.run([compiler, prefix + 'V3', prefix + 'INPUTCHARSET', 'UTF8', prefix + 'DAPP_VERSION=' + version, prefix + 'DBUILD_DIR=' + str(destination), source], cwd=root, check=True)
    setup = inspect_executable(destination / 'RentbookSetup.exe')
    launcher = inspect_executable(destination / 'Rentbook.exe')
    manifest = {
        'name': 'Rentbook Desktop', 'version': version, 'file': 'RentbookSetup.exe',
        'platform': 'Windows 10/11', 'application_url': 'https://thue.filezuno.net/',
        'mode': 'existing-browser-app-window', 'compiler': compiler_version,
        'release_stage': 'test-build',
        'source_sha256': source_fingerprint(root),
        **setup, 'launcher_sha256': launcher['sha256'],
    }
    (destination / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (destination / 'SHA256SUMS.txt').write_text(setup['sha256'] + '  RentbookSetup.exe\n')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', default='1.0.0')
    parser.add_argument('--makensis', default=shutil.which('makensis'))
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent / 'build')
    args = parser.parse_args()
    if not args.makensis:
        raise SystemExit('Install NSIS 3.11+ or pass --makensis with its executable path. No system settings were changed.')
    build(args.version, args.makensis, args.out)


if __name__ == '__main__':
    main()
