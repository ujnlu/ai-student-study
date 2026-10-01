#!/usr/bin/env python3
# encoding: utf-8
#
#  collect_titles.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2019 GunChleoc <fios@foramnagaidhlig.net>
#  SPDX-FileCopyrightText: © 2022 David Revoy <info@davidrevoy.com>

"""Generates titles based on SVG tags in E0X.svg."""

import codecs
from collections import defaultdict
import json
import os.path
import re
import sys
from svg import read_svg


# We get the titles from the thumbnail pictures
EPISODE_REGEX = re.compile(r'E\d+P00\.svg')

# Get argument when the script is called (a single episode directory, optional, without it the script will scan all directories)
episodes = sys.argv[1:]

def main():
    """Collects all episode titles from SVG and writes them to json files."""

    errors = 0

    # Get base path
    base_path = os.path.abspath(os.path.join(
        os.path.dirname(__file__), os.path.pardir))

    print('Collecting title(s) from: %s ' % base_path)

    # Walk directory
    titles = defaultdict(list)
    for (dirpath, _, filenames) in os.walk(base_path):
        for filename in filenames:
            if EPISODE_REGEX.match(filename):
                language = os.path.basename(dirpath)

                # Skip if we're not under lang, to exclude cache
                parent_path = os.path.abspath(os.path.join(
                    dirpath, os.path.pardir))
                if not os.path.basename(parent_path) == 'lang':
                    continue

                # If user added a directory argument when launching the script
                if episodes:
                    # Get the episode path
                    episode_path = os.path.abspath(os.path.join(
                            parent_path, os.path.pardir))
                    # Compare the directory request with the actual one
                    if not os.path.basename(episode_path) == episodes[0]:
                        # They don't match, so skip this loop
                        continue

                # Read title from svg file
                lines = read_svg(os.path.join(dirpath, filename),
                                 {'id': re.compile(r'episode-title(-\d+){0,1}')})

                # Add to dataset if OK
                if len(lines) == 1:
                    episode_path = os.path.abspath(os.path.join(
                        parent_path, os.path.pardir))
                    if not titles[episode_path]:
                        titles[episode_path] = defaultdict(list)
                    titles[episode_path][language] = lines[0]
                else:
                    print('ERROR: Unable to identify title in file',
                          os.path.join(dirpath, filename),
                          '\n       We found:', lines, file=sys.stderr)
                    errors = errors + 1

    # Sort by language and write to JSON
    for output_dir in titles.keys():
        # Ensure destination directory exists
        dest_dir = os.path.join(output_dir, 'hi-res')
        if not os.path.isdir(dest_dir):
            os.makedirs(dest_dir)
        # Write JSON
        dest_filepath = os.path.join(dest_dir, 'titles.json')
        with codecs.open(dest_filepath, encoding='utf-8', mode='w') as dest_file:
            json.dump(titles[output_dir], dest_file, indent=3, sort_keys=True)
            print('* Wrote titles.json to %s' % dest_filepath)

    if errors > 0:
        print('Done with %d error(s).' % errors, file=sys.stderr)
        return 1

    print('Done.')
    return 0


# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main())
