#!/usr/bin/env python3
# encoding: utf-8
#
#  SVG-to-TXT-util.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2019 GunChleoc <fios@foramnagaidhlig.net>
#  SPDX-FileCopyrightText: © 2024 David Revoy <info@davidrevoy.com>

"""Tool for extracting text contents from SVG files and writing them in a text file."""
"""Useful to quickly extract the SVGs of a non Pepper&Carrot comic (webcomic-misc, or MiniFantasyTheatre)."""
"""Usage: Usage: ./SVG-to-TXT-util.py <input_directory> <output_filename> """
"""eg. ./SVG-to-TXT-util.py /home/deevad/peppercarrot/webcomics/misc/2024-12-24_The-Magic-of-Christmas/lang/fr transcript.md
 """

import os.path
from pathlib import Path
import re
import sys
import xml.etree.ElementTree
from markdown import extract_episode_number, make_transcript_filename, \
    read_notes, read_transcript, write_transcript
from svg import read_svg
from polib import pofile
# lines = read_svg(os.path.join(localedir, filename), {})

def process_svg_files(input_directory, output_filename):
    # List to hold all lines extracted from SVG files
    all_lines = []

    # Get a sorted list of all SVG files in the input directory
    svg_files = sorted([filename for filename in os.listdir(input_directory) if filename.endswith('.svg')])

    # Iterate over the sorted list of SVG files
    for filename in svg_files:
        file_path = os.path.join(input_directory, filename)
        print(f"SVG to txt extraction done for: {filename}")
        lines = read_svg(file_path, {})

        # Add the prefix to each element and save it back to lines
        lines = [f"> : {line}" for line in lines]

        # Write the filename to the output
        all_lines.append(f"## {filename}\n")
        all_lines.extend(lines)
        all_lines.append("\n")  # Add a newline for separation between files

    # Define the output file path in the input directory
    output_file = os.path.join(input_directory, output_filename)

    # Check if the target file already exists
    if os.path.exists(output_file):
        base, extension = os.path.splitext(output_file)
        counter = 1

        # Generate a new filename with a suffix
        while os.path.exists(output_file):
            output_file = f"{base}_{counter}{extension}"
            counter += 1

        print(f"The file already exists. Renaming to '{output_file}'.")

    # Write the extracted lines to the output text file
    with open(output_file, 'w') as f:
        for line in all_lines:
            f.write(f"{line}\n")

    print(f"Extracted file written to: {output_file}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: ./script.py <input_absolute/path/to/directory> <output_filename.md>")
        print("      eg. ./SVG-to-TXT-util.py /home/deevad/peppercarrot/webcomics/misc/2024-12-24_The-Magic-of-Christmas/lang/fr transcript.md")
        print("      Note: XML texts need to be sorted in SVGs and image description needs to be added manually")
        sys.exit(1)

    input_directory = sys.argv[1]
    output_filename = sys.argv[2]

    process_svg_files(input_directory, output_filename)
