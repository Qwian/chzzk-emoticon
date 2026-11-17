"""Package verified runtime files; retain current + previous reproducible ZIP.

Old archives are deleted only if every archived byte is reproduced from the
same-version Git snapshot (allowing explicit LF/CRLF conversion for text).
Unknown or modified archives are preserved.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def verify_archive(archive):
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip():
            raise ValueError("ZIP checksum mismatch")
        names = bundle.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP entries")
        manifest = json.loads(bundle.read("manifest.json"))
        required = {"popup.html", "popup.js", "popup.css", manifest["background"]["service_worker"]}
        for entry in manifest["content_scripts"]:
            required.update(entry["js"])
        required.update(manifest.get("icons", {}).values())
        if not required.issubset(names):
            raise ValueError("Missing runtime files")
        return manifest["version"], {name: bundle.read(name) for name in names}


def reproduces(name, source, archived):
    if source == archived:
        return True
    if source is None or Path(name).suffix not in {".js", ".json", ".md", ".css", ".html", ".svg"} or b"\0" in source:
        return False
    # Git's checkout/archive text conversion differs across the old packages.
    # Both candidates must reproduce the archived bytes exactly; other content
    # differences are never accepted or deleted.
    lf = source.replace(b"\r\n", b"\n")
    return archived in (lf, lf.replace(b"\n", b"\r\n"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true", help="After verification, retain current and previous Git-reproducible release")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    files = sorted([*ROOT.glob("*.js"), ROOT / "manifest.json", ROOT / "popup.html", ROOT / "popup.css", ROOT / "PRIVACY.md", ROOT / "README.md", *ROOT.glob("icons/*.png"), ROOT / "vendor/hls.min.js"])
    expected = {file.relative_to(ROOT).as_posix(): file.read_bytes() for file in files}
    archive = OUT / f"chzzk-emoticon-{version}.zip"
    if archive.exists():
        if verify_archive(archive)[1] != expected:
            raise ValueError("Existing same-version ZIP differs; bump the version before packaging")
    else:
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
            for name, data in expected.items():
                bundle.writestr(name, data)
    assert verify_archive(archive) == (version, expected)
    report = {"version": version, "files": len(files), "allBytesMatch": True,
              "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "removed": [], "preservedUncertain": []}
    archives = sorted(OUT.glob("chzzk-emoticon-*.zip"))
    report["beforeBytes"] = sum(file.stat().st_size for file in archives)
    if args.clean:
        commits = {}
        for commit in git("log", "--format=%H", "--", "manifest.json").decode().splitlines():
            try:
                prior = json.loads(git("show", f"{commit}:manifest.json"))["version"]
                commits.setdefault(prior, []).append(commit)
            except (ValueError, subprocess.CalledProcessError):
                continue
        reproducible = []
        for file in archives:
            if file == archive:
                continue
            try:
                prior, contents = verify_archive(file)
                if file.name != f"chzzk-emoticon-{prior}.zip" or not re.fullmatch(r"\d+(?:\.\d+){2,3}", prior):
                    raise ValueError("Unrecognized archive identity")
                if tuple(map(int, prior.split("."))) >= tuple(map(int, version.split("."))):
                    raise ValueError("Not an older release")
                matched = False
                for commit in commits.get(prior, []):
                    with tarfile.open(fileobj=io.BytesIO(git("archive", "--format=tar", commit))) as snapshot:
                        tracked = {member.name: snapshot.extractfile(member).read() for member in snapshot if member.isfile()}
                    if all(reproduces(name, tracked.get(name), data) for name, data in contents.items()):
                        matched = True
                        break
                if not matched:
                    raise ValueError("No byte-identical Git source")
                reproducible.append((tuple(map(int, prior.split("."))), file))
            except (ValueError, KeyError, zipfile.BadZipFile):
                report["preservedUncertain"].append(file.name)
        reproducible.sort(reverse=True)
        previous = next((file for number, file in reproducible if number < tuple(map(int, version.split(".")))), None)
        report["retained"] = [archive.name] + ([previous.name] if previous else [])
        # Keep all old archives if the recovery release could not be verified.
        if previous:
            for _, file in reproducible:
                if file == previous:
                    continue
                if file.resolve().parent != OUT.resolve():
                    raise ValueError("Unsafe archive cleanup path")
                report["removed"].append({"name": file.name, "bytes": file.stat().st_size})
                file.unlink()
    report["afterBytes"] = sum(file.stat().st_size for file in OUT.glob("chzzk-emoticon-*.zip"))
    report["freedBytes"] = report["beforeBytes"] - report["afterBytes"]
    (OUT / f"package-{version}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
