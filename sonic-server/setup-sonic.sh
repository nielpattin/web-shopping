#!/bin/bash

# This script downloads and sets up the Sonic search engine binary.
# It is designed to be robust and suitable for both development and production environments.

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the Sonic version and download URL
SONIC_VERSION="v1.4.9"
SONIC_URL="https://github.com/valeriansaliou/sonic/releases/download/${SONIC_VERSION}/${SONIC_VERSION}-x86_64-gnu.tar.gz"
DOWNLOAD_FILE="sonic.tar.gz"
EXTRACT_DIR="./sonic" # Sonic extracts into a directory named 'sonic' by default

echo "Starting Sonic setup..."

# Step 1: Download the Sonic binary
echo "Downloading Sonic from ${SONIC_URL}..."
if curl -sSfL "${SONIC_URL}" -o "${DOWNLOAD_FILE}"; then
    echo "Sonic downloaded successfully."
else
    echo "Error: Failed to download Sonic. Please check the URL and your internet connection."
    exit 1
fi

# Step 2: Extract the downloaded tarball
echo "Extracting ${DOWNLOAD_FILE}..."
if tar -xzf "${DOWNLOAD_FILE}"; then
    echo "Sonic extracted successfully."
else
    echo "Error: Failed to extract ${DOWNLOAD_FILE}. The file might be corrupted or not a valid tar.gz archive."
    # Clean up downloaded file if extraction fails
    rm -f "${DOWNLOAD_FILE}"
    exit 1
fi

# Step 3: Remove the downloaded tarball
echo "Removing ${DOWNLOAD_FILE}..."
if rm "${DOWNLOAD_FILE}"; then
    echo "${DOWNLOAD_FILE} removed successfully."
else
    echo "Warning: Failed to remove ${DOWNLOAD_FILE}. You may need to remove it manually."
    # Continue, as this is not a critical failure for Sonic setup itself
fi

# Step 4: Make the Sonic binary executable
SONIC_BINARY_PATH="${EXTRACT_DIR}/sonic"
echo "Making ${SONIC_BINARY_PATH} executable..."
if [ -f "${SONIC_BINARY_PATH}" ]; then
    if chmod +x "${SONIC_BINARY_PATH}"; then
        echo "${SONIC_BINARY_PATH} is now executable."
    else
        echo "Error: Failed to make ${SONIC_BINARY_PATH} executable. Please check file permissions."
        exit 1
    fi
else
    echo "Error: Sonic binary not found at ${SONIC_BINARY_PATH} after extraction."
    exit 1
fi

echo "Sonic setup completed successfully. The Sonic binary is located at ${SONIC_BINARY_PATH}"

exit 0