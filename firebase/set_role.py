"""Give an Acurion investigator a role: reviewer, admin or viewer.

Every signed-in account with a verified email is an analyst by default (it reads every record and reviews alerts).
Reviewers and admins can also close alerts, file and close cases, and start or pause Acurion K7 live detection.
A viewer can read but not change anything.

    python firebase/set_role.py --key path/to/service-account.json --uid <Account ID> --role reviewer
    python firebase/set_role.py --key path/to/service-account.json --uid <Account ID> --role analyst   # removes the role

The Account ID is shown on the website under System status > Account ID. Keep the key file outside the repository.
"""

import argparse
import os
import sys

DATABASE_URL = os.environ.get("ACURION_FIREBASE_URL", "https://acurion-2bd21-default-rtdb.firebaseio.com")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--key", required=True, help="the Firebase service-account key file")
    parser.add_argument("--uid", required=True, help="the investigator's Account ID (Firebase Authentication UID)")
    parser.add_argument("--role", required=True, choices=["analyst", "reviewer", "admin", "viewer"])
    parser.add_argument("--database-url", default=DATABASE_URL)
    args = parser.parse_args(argv)
    if not os.path.isfile(args.key):
        print(f"The key file was not found: {args.key}", file=sys.stderr)
        return 1
    import firebase_admin
    from firebase_admin import credentials, db

    firebase_admin.initialize_app(credentials.Certificate(args.key), {"databaseURL": args.database_url})
    ref = db.reference(f"roles/{args.uid}")
    if args.role == "analyst":
        ref.delete()
        print(f"{args.uid} is an analyst (the default for verified accounts).")
    else:
        ref.set(args.role)
        print(f"{args.uid} is now a {args.role}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
