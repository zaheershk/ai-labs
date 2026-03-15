#!/bin/bash
# Usage: ./new-challenge.sh 02 structured-outputs
# Creates challenges/day-02-structured-outputs from the _template

set -e

DAY=$1
NAME=$2

if [ -z "$DAY" ] || [ -z "$NAME" ]; then
  echo "Usage: ./new-challenge.sh <day-number> <challenge-name>"
  echo "Example: ./new-challenge.sh 02 structured-outputs"
  exit 1
fi

FOLDER="challenges/day-${DAY}-${NAME}"

if [ -d "$FOLDER" ]; then
  echo "Error: $FOLDER already exists"
  exit 1
fi

cp -r challenges/_template "$FOLDER"

# Update package.json name
sed -i '' "s/day-NN-challenge-name/day-${DAY}-${NAME}/" "$FOLDER/package.json"

echo "✓ Created $FOLDER"
echo ""
echo "Next steps:"
echo "  1. cd $FOLDER"
echo "  2. cp .env.example .env && fill in keys"
echo "  3. npm install"
echo "  4. Edit src/agent.ts and README.md"
