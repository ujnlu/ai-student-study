#!/usr/bin/env python3
# encoding: utf-8
#
#  combined_html_generator.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019-2020 GunChleoc <fios@foramnagaidhlig.net>
#  Copyright 2023 Andrej Ficko
#

import html
import os.path
from pathlib import Path
import sys, re
#from extract_text import read_dictionary, extract_text_from_page

# svg.py from Pepper&Carrot GIT: webcomics/0_transcripts
from svg import read_svg

"""
This script generates combined HTML for whole language or episode.
It was ment to help translators with spell checking, so they can copy the whole text. (e.g. Libre Office)
As the output messages are minimised, it can be convenient to check for transcription errors in your language.

The default output directory is 0_transcripts/lang/html/ and it is ignored by git, attribute 2 to override it.
It will extract text from .svg's using the transcript generation function, ignoring missing speakers.
"""

# Based on extract_text.py - extract_text_from_page(5) from GunChleoc (extremely ripped off)
def extract_text_from_page_dummy(localedir, pagenumber, filename): # , names, transcript
    """Read text from SVG file and write to CSV.

    Keyword arguments:
    localedir -- the files' directory,
                 e.g. /home/peppercarrot/webcomics/ep01_Potion-of-Flight/lang/fr
    pagenumber -- the page number to be extracted, e.g. 00
    filename -- the SVG file's base filename, e.g. E01P00.svg

    Returns an array of transcript lines, or None if no text was found
    """

    result = []
    lines = read_svg(os.path.join(localedir, filename), {})

    if len(lines) < 1:
        print('No text found, aborting')
        return result

    concatenate = 'False'
    name = '<unknown>'
    position = 0

    for line in lines:
        position = position + 1
        if line != '':
            result.append('|'.join([name, str(position), concatenate, line]))

    # if len(result) == 1:
    #     print('Found ' + str(len(result)) + ' line')
    # else:
    #     print('Found ' + str(len(result)) + ' lines')

    return result

# Based on extract_to_html.py from GunChleoc
def extract_page_to_html(TRANSCRIPT, page, diag):
    ERRORS = 0
    # Read page contents and assign sort order
    raw_rows = {}
    for row in TRANSCRIPT:
        if row[0] == '<hidden>':
            # Translators' instructions etc., we don't want them in the transcript
            continue
        key = int(row[1])
        if key in raw_rows.keys():
            print(diag+' **** ERROR1: On page ' + page +
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
        print(diag+' **** ERROR2: Last row bypassed; must be |False| in ' + '|'.join(raw_rows[last_row_key]) + ' ****', file=sys.stderr)
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
                    print(diag+" **** ERROR3: Title '" +
                        row[0] + "' On page " + page +
                        " does not match previous title '" + title + "' for " +
                        '|'.join(row) + ' ****', file=sys.stderr)
                    ERRORS = ERRORS + 1
                # Catch rows that lack a speaker
                # if row[0] == '<unknown>':
                #     print(diag+' **** ERROR4: On page ' + page +
                #         ', please assign a speaker for ' +
                #         '|'.join(row) + ' ****', file=sys.stderr)
                #     ERRORS = ERRORS + 1

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
    return contents + '</dl>'


def generate_episode_html ( langdir, lang, page_arg):
    if not os.path.exists(langdir / lang):
        return ""
    TRANSCRIPT = {'transcript':{}}
    #sys.stdout = open(os.devnull, 'w')
    #names = read_dictionary(directory.as_posix(), lang)
    #reference_transcript = { 'path': None, 'contents': {} }
    pagefile_regex = re.compile(r'(\d+)\.svg')

    for filename in sorted((langdir/lang).iterdir()):
        match = pagefile_regex.fullmatch(filename.name)
        if match and len(match.groups()) == 1:
            pagenumber = match.groups()[0]
            if page_arg == 'all' or page_arg == pagenumber:
                #print('Extracting texts from ' + filename.name)
                rows = extract_text_from_page_dummy(
                    (langdir/lang).as_posix(),
                    pagenumber,
                    filename.name)
                    #names,
                    #reference_transcript['contents'])
                if rows:
                    TRANSCRIPT['transcript'][pagenumber]=[]
                    for row in rows:
                        TRANSCRIPT['transcript'][pagenumber].append(row.split("|"))
    #sys.stdout = sys.__stdout__

    transcript_html = ""
    for page in TRANSCRIPT['transcript']:
        page_html = extract_page_to_html(TRANSCRIPT['transcript'][page], page, lang.upper()+": MFT "+page)
        page_html = "<h4>" + lang.upper()+": MFT "+page+ "</h4>\n" + page_html.replace("</dd>\n    <dd>","</td></tr><tr><td>")
        transcript_html+=page_html

    # This part from older version of my script just works and I prefer not to touch it ;)
    transcript_html=transcript_html.replace("<strong>&lt;unknown&gt;</strong>","")
    transcript_html=transcript_html.replace("<dl>","<table><tr><td>").replace("</dl>","</td></tr></table>\n").replace("<dd>","").replace("</dt>","")
    transcript_html=transcript_html.replace("<dt>","</td></tr><tr><td>").replace("</dd>","").replace("<tr><td></td></tr>","")
    return transcript_html


def generate_bundled_html (locale_arg, destdirectory):
    langdir = directory / "lang"
    html_output = ""
    if locale_arg.isnumeric():
        locale_arg = f"{int(locale_arg):03}"
        for lang in os.listdir(langdir):
            if os.path.isdir(langdir / lang):
                html_output += generate_episode_html(langdir, lang, locale_arg)
    else:
        html_output = generate_episode_html(langdir, locale_arg, "all")

    if html_output:
        html_output = "<style>table, th, td {border: 1px solid; width:100%;} body{font-family: 'ubuntu, arial, sans-serif';}</style>\n" + html_output
        html_file = destdirectory / ("mft_"+locale_arg+".html")
        with open(html_file, 'w', encoding='utf-8', newline='\n') as f:
            f.write(html_output)
            print('HTML written to ' + str(html_file))


def main():
    if len(sys.argv) < 2:
        print('Wrong number of arguments! Usage:')
        print('    0_transcripts/combined_html_generator.py <locale or episode_number> <destinationdirectory(optional,absolute path)>')
        print('For example:')
        print('    0_transcripts/combined_html_generator.py fr')
        print('    0_transcripts/combined_html_generator.py 13')
        print('You can also generate all languages using "all" as locale.')
        print('    0_transcripts/combined_html_generator.py all /destination/path/of/your/choice')
        sys.exit(1)
    destdirectory = Path(os.path.dirname(scriptpath)) / "lang" / "html"

    if len(sys.argv) == 3:
        destdirectory = Path(sys.argv[2])
        print('==> Debug, destination path found:', destdirectory)
        print('Directory:', directory)
    if not os.path.isdir(destdirectory):
        os.makedirs(destdirectory)

    if not sys.argv[1] == 'all':
        generate_bundled_html(sys.argv[1], destdirectory)
    else:
        for lang in os.listdir(directory / "lang"):
            if os.path.isdir(directory / "lang" / lang):
                generate_bundled_html(lang, destdirectory)

scriptpath = os.path.abspath(__file__)
directory = Path(os.path.dirname(scriptpath)).parent / "miniFantasyTheater"
# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main())
