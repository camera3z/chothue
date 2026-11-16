import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('deploy_sso', Path(__file__).resolve().parents[1]/'deploy/deploy-sso.py')
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)


def static(root, label):
    (root/'assets').mkdir(parents=True)
    (root/'assets'/f'{label}.js').write_text(label)
    (root/'index.html').write_text(f'<script type="module" src="/assets/{label}.js"></script>')


class DeployTests(unittest.TestCase):
    def test_resolves_only_rentbook_and_keeps_other_hosts_separate(self):
        config = '''# configuration file /etc/nginx/nginx.conf:
        events {} http {
          server {listen 80; server_name thue.filezuno.net; return 301 https://$host$request_uri;}
          server {listen 443 ssl; server_name thue.filezuno.net; root "/var/www/chothue/dist";
            location / {try_files $uri $uri/ /index.html;}
            location ~ /\\. { deny all; }
          }
          server {server_name filezuno.net; root /var/www/filezuno;}
          server {server_name qrmenu.example.com; root /var/www/qrmenu;}
        }'''
        self.assertEqual(d.detect_root(config),Path('/var/www/chothue/dist'))
    def test_refuses_ambiguous_shared_dynamic_and_missing_roots(self):
        configs = [
            'server {server_name thue.filezuno.net; root /a;} server {server_name thue.filezuno.net; root /b;}',
            'server {server_name thue.filezuno.net; root /a;} server {server_name filezuno.net; root /a;}',
            'server {server_name thue.filezuno.net filezuno.net; root /a;}',
            'server {server_name thue.filezuno.net; root $base/dist;}',
            'server {server_name other.net; root /a;}',
            'server {server_name thue.filezuno.net; root /a;',
        ]
        for config in configs:
            with self.subTest(config=config), self.assertRaises(d.DeployError): d.detect_root(config)
    def test_existing_public_config_is_not_changed(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'.env.local'
            claims=base64.urlsafe_b64encode(json.dumps({'role':'anon','ref':d.PROJECT}).encode()).decode().rstrip('=')
            text=f'VITE_SUPABASE_URL=https://{d.PROJECT}.supabase.co\nVITE_SUPABASE_ANON_KEY=header.{claims}.signature\nPRIVATE_OTHER=preserve\n'
            path.write_text(text)
            values=d.build_settings(path)
            self.assertEqual(values['VITE_FILEZUNO_SSO'],'1')
            self.assertNotIn('PRIVATE_OTHER',values)
            self.assertEqual(path.read_text(),text)
    def test_privileged_or_wrong_project_key_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'.env.local'
            for key in ['sb_secret_'+'x'*40, 'invalid', 'sb_publishable_short']:
                path.write_text(f'VITE_SUPABASE_URL=https://{d.PROJECT}.supabase.co\nVITE_SUPABASE_ANON_KEY={key}\n')
                with self.assertRaises(d.DeployError):d.build_settings(path)
            path.write_text('VITE_SUPABASE_URL=https://wrong.supabase.co\nVITE_SUPABASE_ANON_KEY=sb_publishable_'+'x'*40)
            with self.assertRaises(d.DeployError):d.build_settings(path)
    def test_publish_retains_old_assets_and_verifies_new_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);old=base/'web';new=base/'dist';backup=base/'backup'
            static(old,'old'); static(new,'new')
            d.deploy(new,old,backup,lambda root:d.check_served(root,lambda url:(root/('index.html' if url=='/' else url.lstrip('/'))).read_bytes()))
            self.assertEqual((old/'index.html').read_bytes(),(new/'index.html').read_bytes())
            self.assertTrue((old/'assets/old.js').exists())
            self.assertTrue((old/'assets/new.js').exists())
            self.assertIn('old.js',(backup/'index.html').read_text())
            self.assertEqual((old/'assets/new.js').stat().st_mode&0o777,0o644)
    def test_failed_health_check_restores_old_html_and_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);old=base/'web';new=base/'dist';backup=base/'backup'
            static(old,'old');static(new,'new')
            before=(old/'index.html').read_bytes()
            def fail(_):raise d.DeployError('health failed')
            with self.assertRaises(d.DeployError):d.deploy(new,old,backup,fail)
            self.assertEqual((old/'index.html').read_bytes(),before)
            self.assertEqual((old/'assets/old.js').read_text(),'old')
    def test_health_requires_actual_js_not_spa_fallback_html(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);static(root,'actual')
            with self.assertRaises(d.DeployError):d.check_served(root,lambda url:(root/'index.html').read_bytes())
    def test_symlink_targets_rejected_without_writing_outside_root(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);old=base/'web';new=base/'dist';outside=base/'outside'
            static(new,'new');outside.mkdir();old.mkdir();(old/'assets').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(d.DeployError):d.publish(new,old)
            self.assertEqual(list(outside.iterdir()),[])

if __name__=='__main__':unittest.main(verbosity=2)
