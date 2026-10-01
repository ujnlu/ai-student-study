#!/usr/bin/env python3
# encoding: utf-8
#
#  extract_to_html.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019 GunChleoc <fios@foramnagaidhlig.net>
#

import html
import os.path
from pathlib import Path
import sys
from markdown import extract_episode_number, make_transcript_filename, read_transcript


print('######################################################################')
print('#     Tool for converting extracted texts from Markdown to HTML      #')
print('######################################################################')

def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha() and lang.islower()

argv = sys.argv
script_root = Path(os.path.dirname(os.path.abspath(__file__))).parent.resolve()

# If the full path is given as an argument, the required data will be extracted. (drag&drop input method)
if len(argv) == 2:
    if argv[1].count("/") == 1: # expected episode/locale - common typo on manual input
        in_arg = argv[1].split("/")
        if extract_episode_number(in_arg[0]) and is_valid_lang_name(in_arg[1]):
            argv = argv[:1] + in_arg

    else: # make drag&drop work (check and extract data from absolute path)
        input_path = Path(os.path.abspath(argv[1])).resolve() # resolves hyperlink path, just like in scriptpath
        if str(script_root) in str(input_path):
            input_relative = input_path.relative_to(script_root).parts# [episode, "lang", locale, *]
            if len(input_relative) >= 3 and extract_episode_number(input_relative[0]):
                if input_relative[1] == 'lang' and is_valid_lang_name(input_relative[2]):
                    argv = argv[:1] + [input_relative[0], input_relative[2]] # replacing arguments

# The first argument is the script name itself, so we expect 3 of them
if len(argv) != 3:
    print('\nWrong number of arguments! Usage:')
    print('    0_transcripts/extract_to_html.py <episode> <locale>')
    print('For example:')
    print('    0_transcripts/extract_to_html.py ep01_Potion-of-Flight fr')
    print('\n  Alternatively you can use a single argument (or drag&drop file) with a full path.')
    print('     e.g. /home/user/peppercarrot/webcomics/ep11_The-Witches-of-Chaosah/lang/fr')
    print('      or  C:\\\\Users\\\\User\\\\Documents\\\\webcomics\\\\ep38_The-Healer\\\\lang\\\\en')
    print('   and also works with links like: ...\\\\webcomics-linked\\\\fr\\\\E36P06.svg')
    if os.path.isabs(argv[0]):
        input('\n     Press Enter to end... ')
    sys.exit(1)

EPISODE = argv[1]
LOCALE = argv[2]


print("Episode '" + EPISODE + "', locale '" + LOCALE + "'")

EPISODE_NUMBER = extract_episode_number(EPISODE)
if EPISODE_NUMBER == '':
    sys.exit(1)

# Get the repository's base directory and navigate to the episode's locale's folder
DIRECTORY = Path(
    os.path.dirname(os.path.abspath(__file__))).parent / EPISODE / 'lang' / LOCALE

# Path for the rendered html files
RENDERINGDIR = Path(
    os.path.dirname(os.path.abspath(__file__))).parent / EPISODE / 'hi-res' / 'html'
if not os.path.exists(RENDERINGDIR):
    os.makedirs(RENDERINGDIR)

# Get markdown transcript filename
TRANSCRIPT_PATH = DIRECTORY / make_transcript_filename(EPISODE_NUMBER, LOCALE)

if not (TRANSCRIPT_PATH.exists() and TRANSCRIPT_PATH.is_file()):
    print('No transcript found for', TRANSCRIPT_PATH.as_posix())
    sys.exit(0)

TRANSCRIPT = read_transcript(TRANSCRIPT_PATH)
if TRANSCRIPT['errors'] > 0:
    print('======================================================================', file=sys.stderr)
    print('Encountered', TRANSCRIPT['errors'], 'error(s)!', file=sys.stderr)
    print('######################################################################', file=sys.stderr)
    sys.exit(1)

print('Directory:', TRANSCRIPT_PATH.parent)

ERRORS = 0
for page in TRANSCRIPT['transcript']:
    print('======================================================================')
    print('Creating HTML for P' + page)
    diag_info = LOCALE.upper()+": E"+EPISODE_NUMBER+" P"+page

    # Read page contents and assign sort order
    raw_rows = {}
    for row in TRANSCRIPT['transcript'][page]:
        if row[0] == '<hidden>':
            # Translators' instructions etc., we don't want them in the transcript
            continue
        key = int(row[1])
        if key in raw_rows.keys():
            print('**** '+diag_info+' - ERROR1: On page ' + page +
                  ', DUPLICATE POSITION ' + str(key) + '! Rows:\n**** \t' +
                  '|'.join(row) + '\n**** \t' + '|'.join(raw_rows[key]) + ' ****',
                  file=sys.stderr)
            ERRORS = ERRORS + 1
        raw_rows[key] = row

    # Combine data into nodes - for rows that contain "True",
    # the following row ends up in the same entry
    entries = []
    current_rows = []
    row = []

    # Ensure we don't accidentally skip the final row
    last_row_key = sorted(raw_rows.keys())[-1]
    if raw_rows[last_row_key][2] == 'True':
        print('**** '+diag_info+' - ERROR2: Last row bypassed; must be |False| in ' + '|'.join(raw_rows[last_row_key]) + ' ****', file=sys.stderr)
        ERRORS = ERRORS + 1
        raw_rows[last_row_key][2] = 'False'

    for key in sorted(raw_rows.keys()):
        row = raw_rows[key]

        current_rows.append(row)

        if row[2] == 'False':
            entries.append(current_rows)
            current_rows = []

    # Now generate the HTML code
    contents = '<dl>'
    title = ''
    for entry in entries:
        text = ''
        if entry:
            # Add title whenever somebody else starts speaking/making a noise etc.
            if entry[0][0] != title:
                title = entry[0][0]
                contents = contents + '<dt><strong>' + \
                    html.escape(title) + '</strong></dt>\n'

            # Assemble rows for this entry
            for row in entry:
                # Catch obvious bugs with True/False assignment
                if title != row[0]:
                    print('**** '+diag_info+" - ERROR3: Title '" +
                          row[0] + "' On page " + page +
                          " does not match previous title '" + title + "' for " +
                          '|'.join(row) + ' ****', file=sys.stderr)
                    ERRORS = ERRORS + 1
                # Catch rows that lack a speaker
                if row[0] == '<unknown>':
                    print('**** '+diag_info+' - ERROR4: On page ' + page +
                          ', please assign a speaker for ' +
                          '|'.join(row) + ' ****', file=sys.stderr)
                    ERRORS = ERRORS + 1

                # Add current row to output text
                if len(row) > 4 and row[4] == 'nowhitespace':
                    # Assembled sounds, bird tweetings etc. don't get blank spaces
                    text = text + row[3].replace(' ', '')
                else:
                    text = text + ' ' + row[3]

                # No more rows will be combined into this output text line,
                # let's add the line and start a fresh one
                if row[2] == 'False':
                    contents = contents + '    <dd>' + \
                        html.escape(text.strip()) + '</dd>\n'
                    text = ''

    contents = contents + '</dl>'

    # Print HTML to file <local>_E<number>P<number>.html
    html_file = RENDERINGDIR.as_posix() + '/' + LOCALE + '_E' + EPISODE_NUMBER + 'P' + page + '.html'
    with open(html_file, 'w', encoding='utf-8', newline='\n') as f:
        f.write(contents)
        print('HTML written to ' + html_file)

print('======================================================================')
if ERRORS > 0:
    print('Encountered', ERRORS, 'error(s)!', file=sys.stderr)
    print('######################################################################', file=sys.stderr)
    sys.exit(1)
else:
    print('Done!')
    print('######################################################################')
