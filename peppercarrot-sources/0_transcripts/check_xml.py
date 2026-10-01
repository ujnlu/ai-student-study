#!/usr/bin/env python3
# encoding: utf-8
#
#  check_xml.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019 GunChleoc <fios@foramnagaidhlig.net>
#

import os.path
from pathlib import Path
import re
import traceback
import sys
import xml.etree.ElementTree
from markdown import extract_episode_number

def main():
    """Get episode name and locale from command line, then iterate over the SVG
    files and load them with the XML parser, then exit if an Exception was raised.

    Usage:   0_transcripts/check_xml.py <episode> <locale>
    Example: 0_transcripts/check_xml.py ep01_Potion-of-Flight fr"""

    # The first argument is the script name itself, so we expect 3 of them
    if len(sys.argv) != 3:
        print('Wrong number of arguments! Usage:')
        print('    0_transcripts/validate_svg.py <episode> <locale>')
        print('For example:')
        print('    0_transcripts/validate_svg.py ep01_Potion-of-Flight fr')
        sys.exit(1)

    episode = sys.argv[1]
    locale = sys.argv[2]

    if episode.startswith("miniFantasyTheater"):
        # bypass sys.stderr from extract_episode_number()
        pagefile_regex = re.compile(r'(\d+)\.svg')
        episode_number = "mft"
    else:
        # Common pattern for main story
        pagefile_regex = re.compile(r'E\d+P(\d+)\.svg')
        episode_number = extract_episode_number(episode)

    # Only continue if we can identify the episode
    if episode_number == '':
        sys.exit(1)

    # Get the repository's base directory
    scriptpath = os.path.abspath(__file__)
    directory = Path(os.path.dirname(scriptpath)).parent

    # Navigate to the episode's lang folder
    directory = directory / episode / 'lang' / locale

    # Find all panel SVGs and load them
    for filename in sorted(directory.iterdir()):
        match = pagefile_regex.fullmatch(filename.name)
        if match and len(match.groups()) == 1:
            try:
                xml.etree.ElementTree.parse(directory.as_posix() + '/' + filename.name).getroot()
            except Exception:
                print('### Error in ' + directory.as_posix() + '/' + filename.name, file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr)
                sys.exit(1)


# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main())
