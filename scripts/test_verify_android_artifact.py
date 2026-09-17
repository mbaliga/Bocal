import tempfile
import unittest
import zipfile
from pathlib import Path
from verify_android_artifact import verify_artifact, verify_html

HTML = ("<html><title>Bocal</title>" + " " * 10000 +
        'data:model/gltf-binary;base64,AAAA data:model/gltf-binary;base64,BBBB</html>').encode()

class ArtifactTests(unittest.TestCase):
    def test_embedded_models(self):
        verify_html(HTML)
    def test_empty_page(self):
        with self.assertRaises(ValueError): verify_html(b"<html>Bocal</html>")
    def test_missing_model(self):
        with self.assertRaises(ValueError): verify_html(HTML.replace(b"data:model/gltf-binary;base64,AAAA", b"missing"))
    def test_external_script(self):
        with self.assertRaises(ValueError): verify_html(HTML + b'<script src="https://example.com/a.js"></script>')
    def test_protocol_relative_stylesheet(self):
        with self.assertRaises(ValueError): verify_html(HTML + b'<link href="//example.com/a.css">')
    def test_unresolved_model(self):
        with self.assertRaises(ValueError): verify_html(HTML + b'"/models/sax.glb"')
    def test_credit_links_allowed(self):
        verify_html(HTML + b'<a href="https://example.com">Credits</a>')
    def test_apk_exact_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expected = root / "app.html"
            expected.write_bytes(HTML)
            apk = root / "app.apk"
            with zipfile.ZipFile(apk, "w") as archive: archive.writestr("assets/www/app.html", HTML)
            self.assertEqual(verify_artifact(apk, expected)["web_bytes"], len(HTML))
    def test_aab_exact_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            aab = Path(directory) / "app.aab"
            with zipfile.ZipFile(aab, "w") as archive: archive.writestr("base/assets/www/app.html", HTML)
            self.assertEqual(len(verify_artifact(aab)["sha256"]), 64)
    def test_stale_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expected = root / "app.html"
            expected.write_bytes(HTML + b"new build")
            apk = root / "app.apk"
            with zipfile.ZipFile(apk, "w") as archive: archive.writestr("assets/www/app.html", HTML)
            with self.assertRaisesRegex(ValueError, "differs"): verify_artifact(apk, expected)
    def test_missing_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            apk = Path(directory) / "app.apk"
            with zipfile.ZipFile(apk, "w") as archive: archive.writestr("wrong.html", HTML)
            with self.assertRaises(KeyError): verify_artifact(apk)

if __name__ == "__main__": unittest.main()
