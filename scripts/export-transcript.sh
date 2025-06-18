#!/bin/bash
# Export transcript in different formats

VIDEO_ID=$1
FORMAT=${2:-srt}
OUTPUT_FILE=${3:-transcript.$FORMAT}

if [ -z "$VIDEO_ID" ]; then
  echo "Usage: $0 <video_id> [format] [output_file]"
  echo "Formats: srt, vtt, txt, json"
  exit 1
fi

API_URL="http://localhost:3000/api/transcript"
AUTH_TOKEN=${AUTH_TOKEN:-"your-token"}

echo "Exporting transcript for video: $VIDEO_ID"
echo "Format: $FORMAT"

curl -s -X GET "${API_URL}/${VIDEO_ID}/export?format=${FORMAT}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -o "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
  echo "Transcript exported to: $OUTPUT_FILE"
else
  echo "Failed to export transcript"
fi
