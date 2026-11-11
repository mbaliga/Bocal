import tempfile
import unittest
import zipfile
from pathlib import Path

from verify_payload import verify_payload

HTML = ("<html><title>Bocal</title>" + " " * 10000 +
        'data:model/gltf-binary;base64,AAAA data:model/gltf-binary;base64,BBBB</html>').encode()


class PayloadTests(unittest.TestCase):
    def build(self, members, expected=HTML):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        (root / "expected.html").write_bytes(expected)
        artifact = root / "host.zip"
        with zipfile.ZipFile(artifact, "w") as archive:
            for name, data in members.items():
                archive.writestr(name, data)
        return artifact, root / "expected.html"

    def test_identical_payload_passes(self):
        artifact, expected = self.build({"app/www/index.html": HTML, "Info.txt": b"com.asoc.bocal"})
        self.assertEqual(verify_payload(artifact, expected)["web_bytes"], len(HTML))

    def test_android_layout_found(self):
        artifact, expected = self.build({"assets/www/app.html": HTML})
        self.assertEqual(verify_payload(artifact, expected)["payload_member"], "assets/www/app.html")

    def test_explicit_member(self):
        artifact, expected = self.build({"odd/place.html": HTML})
        verify_payload(artifact, expected, member="odd/place.html")

    def test_different_payload_rejected(self):
        artifact, expected = self.build({"index.html": HTML}, expected=HTML + b"new")
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_payload(artifact, expected)

    def test_missing_payload(self):
        artifact, expected = self.build({"readme.txt": b"x"})
        with self.assertRaises(KeyError):
            verify_payload(artifact, expected)

    def test_ambiguous_payload(self):
        artifact, expected = self.build({"a/index.html": HTML, "b/index.html": HTML})
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            verify_payload(artifact, expected)

    def test_existing_html_checks_still_apply(self):
        bad = HTML + b'<script src="https://example.com/a.js"></script>'
        artifact, expected = self.build({"index.html": bad}, expected=bad)
        with self.assertRaisesRegex(ValueError, "remote script"):
            verify_payload(artifact, expected)

    def test_conformance_page_by_name(self):
        artifact, expected = self.build({"index.html": HTML, "host-conformance.html": b"<html></html>"})
        with self.assertRaisesRegex(ValueError, "Conformance page"):
            verify_payload(artifact, expected)

    def test_conformance_marker_in_other_member(self):
        artifact, expected = self.build({"index.html": HTML, "x.html": b"<meta name=bocal-host-conformance>"})
        with self.assertRaisesRegex(ValueError, "Conformance marker"):
            verify_payload(artifact, expected)

    def test_conformance_marker_in_payload(self):
        marked = HTML + b"<!-- bocal-host-conformance -->"
        artifact, expected = self.build({"index.html": marked}, expected=marked)
        with self.assertRaisesRegex(ValueError, "Conformance marker"):
            verify_payload(artifact, expected)

    def test_placeholder_in_config(self):
        artifact, expected = self.build({"index.html": HTML, "tauri.conf.json": b'{"identifier":"INVALID-PLACEHOLDER"}'})
        with self.assertRaisesRegex(ValueError, "Placeholder"):
            verify_payload(artifact, expected)

    def test_placeholder_template_token(self):
        artifact, expected = self.build({"index.html": HTML, "manifest.json": b'{"name":"@UT_NAME@"}'})
        with self.assertRaisesRegex(ValueError, "Placeholder"):
            verify_payload(artifact, expected)

    def test_placeholder_in_member_name(self):
        artifact, expected = self.build({"index.html": HTML, "invalid.placeholder.desktop": b"x"})
        with self.assertRaisesRegex(ValueError, "Placeholder"):
            verify_payload(artifact, expected)

    def test_placeholder_allowed_for_compile_only(self):
        artifact, expected = self.build({"index.html": HTML, "c.json": b"INVALID-PLACEHOLDER"})
        verify_payload(artifact, expected, allow_placeholder=True)

    def test_not_a_zip(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        (root / "e.html").write_bytes(HTML)
        (root / "x.click").write_bytes(b"!<arch>\n")
        with self.assertRaises(zipfile.BadZipFile):
            verify_payload(root / "x.click", root / "e.html")


if __name__ == "__main__":
    unittest.main()
