"""Fetch the Challenge 3 data from the hackathon Google Drive into data/challenge3_game_load/.

Usage:  pip install gdown && python scripts/download_data.py [--videos]
Runs one download per process in parallel because the Drive link throttles each connection (~75 kB/s).
Drive IDs are for files owned by the hackathon organisers; the data is restricted, keep data/ out of git.
"""
import os, sys, subprocess
BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "challenge3_game_load")
FILES = [
    ("1fm12VKGbncsV5IOU1xMcei79Nsk9b9Zi", "event_logs/top_casino_users_event_logs.csv"),
    ("1VCCo8uKdYWRuzxYtpx-L9DZO1a_CoRj8", "event_logs/top_casino_users_event_logs_v2.xlsx"),
    ("10SHIXnZikp8ZM1zDY7zQ5onICplEaEDq", "event_logs/CA_Player.csv"),
    ("1bCO-7s8Y8M0DzxCE4iEElMY785TTmbZY", "event_logs/hackathon_casino_trends.xlsx"),
    ("1RUkxHqNRv1y3sAYB_nKPDbI7ahfKZheH", "docs/FEG Innovation Hackathon 2026 - EU regulations guide.pdf"),
    ("1btfD1IkLykFjO8jguJ45XkCAV0Mztvk1", "docs/image.png"),
]
VIDEOS = [
    ("1RJ6wdps2eVrYW4JXvAcZekXGdk_4wtav", "videos/Gaming Casino.mp4"),
    ("1cO3xi1qbDf_rIPyTWKPaYrqw3w65un-9", "videos/Web application walkthrough.mp4"),
    ("1dV0h6Hbf8A30z4qJoMk3L620FHvuuKyO", "videos/Mobile View & Native apps.mp4"),
]
# Game bundle zip (already extracted in the repo as assets/empireofgold/): 1TeZPx8ZS7utmYcovF9lXfBTD9rqYJ8E9

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--one":
        import gdown
        fid, rel = sys.argv[2], sys.argv[3]
        out = os.path.join(BASE, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(out) and os.path.getsize(out) > 0:
            print("SKIP", rel); sys.exit()
        gdown.download(id=fid, output=out, quiet=True)
        print("DONE", rel, os.path.getsize(out) if os.path.exists(out) else "MISSING")
    else:
        todo = FILES + (VIDEOS if "--videos" in sys.argv else [])
        procs = [subprocess.Popen([sys.executable, __file__, "--one", fid, rel]) for fid, rel in todo]
        sys.exit(max(p.wait() for p in procs))
