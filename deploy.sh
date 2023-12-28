#!/bin/sh

printf "\033[0;32mDeploying updates to GitHub...\033[0m\n"

set -e

# Add changes to git.
git add .

# Commit changes.
msg="Rebuilding site $(date "+%Y-%m%d-%H%M")"
if [ -n "$*" ]; then
	msg="$*"
fi
git commit -m "$msg"

# Push source and build repos.
git push origin main
