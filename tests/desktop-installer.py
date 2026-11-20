import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('windows_build',ROOT/'desktop/build_windows.py')
desktop=importlib.util.module_from_spec(spec);spec.loader.exec_module(desktop)
BUILD=Path(os.environ.get('RENTBOOK_WINDOWS_BUILD',ROOT/'desktop/build'))


class InstallerTests(unittest.TestCase):
    def test_both_binaries_are_windows_gui_executables_without_admin_or_signature_claims(self):
        for name in ['RentbookSetup.exe','Rentbook.exe']:
            with self.subTest(name=name):
                info=desktop.inspect_executable(BUILD/name)
                self.assertGreater(info['size'],100000)
                self.assertEqual(info['authenticode_status'],'unsigned')
                manifest=re.findall(rb'<requestedExecutionLevel[^>]+>',(BUILD/name).read_bytes())
                self.assertEqual(len(manifest),1)
                self.assertIn(b'asInvoker',manifest[0]);self.assertNotIn(b'requireAdministrator',manifest[0])
                self.assertIn(b'8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a',(BUILD/name).read_bytes())

    def test_release_hashes_match_real_artifacts_and_current_source(self):
        manifest=json.loads((BUILD/'release.json').read_text())
        self.assertEqual(manifest['sha256'],hashlib.sha256((BUILD/'RentbookSetup.exe').read_bytes()).hexdigest())
        self.assertEqual(manifest['launcher_sha256'],hashlib.sha256((BUILD/'Rentbook.exe').read_bytes()).hexdigest())
        self.assertEqual(manifest['size'],(BUILD/'RentbookSetup.exe').stat().st_size)
        self.assertEqual(manifest['source_sha256'],desktop.source_fingerprint(ROOT/'desktop'))
        self.assertEqual(manifest['application_url'],'https://thue.filezuno.net/')
        self.assertEqual(manifest['mode'],'existing-browser-app-window')
        self.assertEqual(manifest['release_stage'],'test-build')
        self.assertEqual((BUILD/'SHA256SUMS.txt').read_text().strip(),manifest['sha256']+'  RentbookSetup.exe')

    def test_installer_only_touches_its_per_user_directory_shortcuts_and_registry(self):
        source=(ROOT/'desktop/installer.nsi').read_text()
        self.assertNotRegex(source,r'(?im)^\s*(?:WriteReg\w+|DeleteRegKey)\s+HKLM')
        self.assertNotRegex(source,r'(?im)^\s*RMDir\s+/r\b')
        self.assertNotIn('SetShellVarContext all',source)
        deletes=re.findall(r'(?im)^\s*Delete\s+"([^"]+)"',source)
        self.assertEqual(set(deletes),{
            '$DESKTOP\\Rentbook Desktop.lnk',
            '$SMPROGRAMS\\Filezuno\\Rentbook Desktop\\Rentbook Desktop.lnk',
            '$SMPROGRAMS\\Filezuno\\Rentbook Desktop\\Gỡ Rentbook Desktop.lnk',
            '$INSTDIR\\Rentbook.exe','$INSTDIR\\rentbook.ico','$INSTDIR\\HUONG-DAN.txt','$INSTDIR\\Uninstall.exe',
        })
        # This comparison gates all uninstall instructions, including a copied
        # uninstaller or a user-supplied /D= directory override.
        self.assertIn('StrCmp $INSTDIR "$LOCALAPPDATA\\Programs\\Filezuno\\Rentbook" path_ok',source)

    def test_launcher_keeps_browser_sandbox_and_uses_only_the_fixed_https_app(self):
        source=(ROOT/'desktop/browser.nsh').read_text()
        commands=re.findall(r'(?im)^\s*Exec\s+(.+)$',source)
        self.assertEqual(commands,['\'"$BrowserPath" --app="https://thue.filezuno.net/"\''])
        for flag in ['--no-sandbox','--disable-web-security','--user-data-dir','powershell','cmd.exe']:
            self.assertNotIn(flag,source)

    def test_installer_payload_extracts_to_expected_files_with_matching_launcher(self):
        archive=os.environ.get('SEVEN_ZIP') or shutil.which('7z')
        self.assertTrue(archive,'Set SEVEN_ZIP to a full 7-Zip executable to inspect the compiled NSIS payload.')
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run([archive,'x','-y','-o'+directory,str(BUILD/'RentbookSetup.exe')],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            extracted=Path(directory)
            self.assertEqual({p.name for p in extracted.iterdir()},{'$PLUGINSDIR','Rentbook.exe','rentbook.ico','HUONG-DAN.txt'})
            for name,original in [('Rentbook.exe',BUILD/'Rentbook.exe'),('rentbook.ico',ROOT/'desktop/assets/rentbook.ico'),('HUONG-DAN.txt',ROOT/'desktop/WINDOWS-USER.txt')]:
                self.assertEqual((extracted/name).read_bytes(),original.read_bytes())

    def test_invalid_binary_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'bad.exe';path.write_bytes(b'not an executable')
            with self.assertRaises(ValueError):desktop.inspect_executable(path)


if __name__=='__main__':unittest.main(verbosity=2)
