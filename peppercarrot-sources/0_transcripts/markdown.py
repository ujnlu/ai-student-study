#!/usr/bin/env python3
# encoding: utf-8
#
#  markdown.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019 GunChleoc <fios@foramnagaidhlig.net>
#

import os.path
import re
import sys

TABLE_HEADER = 'Name|Position|Concatenate|Text|Whitespace (Optional)'
TABLE_HEADER_FORMATTER = '----|--------|-----------|----|---------------------'
TABLE_HEADER_FORMATTER_REGEX = re.compile(r'(-+(:){0,1}\s*\|\s*(:){0,1}){4}-+')


def extract_episode_number(episode):
    """Extracts the episode number from an episode's directory.

    Keyword arguments:
    episode -- the episode's directory, e.g. ep01_Potion-of-Flight

    Returns the episode number as string, e.g. 01
    """

    episode_number_regex = re.compile(r'.*ep(\d+)_')
    match = episode_number_regex.match(episode)
    if match and len(match.groups()) == 1:
        return match.groups()[0]

    print('ERROR: Unable to extract episode number from:', episode, file=sys.stderr)
    return ''


def make_transcript_filename(episode_number, locale):
    """Constructs the markdown file's name for a transcript.

    Keyword arguments:
    episode_number -- the episode's number, e.g. 01
    locale -- the locale for the transcript, e.g. fr
    """

    return 'ep' + episode_number + '_' + locale + '_transcript.md'


def read_transcript(sourcepath):
    """Reads the pages and their lines from a markdown transcript into a data
    structure.

    The data structure looks like this:

        {
            '00' : [
                [ 'Title', 1, 'False', 'Episode 1: The Potion of Flight' ]
            ],
            '01' : [
                [ 'Pepper', 1, 'False', '...and the last touch' ]
                [ 'Pepper', 4, 'False', '...mmm probably not strong enough' ]
                [ 'Sound', 2, 'True', 'SHH' ]
                [ 'Sound', 3, 'False', 'SHH' ]
                [ 'Sound', 5, 'True', 'PLOP' ]
                [ 'Sound', 6, 'False', 'PLOP' ]
            ],
            ...
        }

    Returns

        {
            'transcript': <the data structure above>,
            'errors': <number of errors encountered>
        }

    Keyword arguments:
    sourcepath -- the full path to the markdown transcript file
    """

    result = {}

    page_regex = re.compile(r'^\#\#\#\sP(\d+)$')

    if not (sourcepath.exists() and sourcepath.is_file()):
        print("The transcript '" + sourcepath.name + "' does not exist yet.")
        return result

    print('Read transcript for: ' + sourcepath.name)
    with open(sourcepath.as_posix(), 'r', encoding='utf-8') as sourcefile:
        errors = 0
        page = []
        # The page number acts as key for accessing the page contents
        pageno = ''
        for line in sourcefile.readlines():
            line = line.strip()
            match = page_regex.match(line)
            if match:
                if page:
                    result[pageno] = page
                    page = []
                pageno = match.groups()[0]
            elif pageno != '':
                if not line or line == TABLE_HEADER or TABLE_HEADER_FORMATTER_REGEX.match(line):
                    continue

                # Split line with delimiter while handling \| escaped literals
                row = []
                previous_character = ''
                cell = ''
                for character in list(line):
                    if character == '|' and previous_character != '\\':
                        row.append(cell)
                        previous_character = ''
                        cell = ''
                    else:
                        cell = cell + character
                        previous_character = character
                if not cell == '':
                    row.append(cell)

                # Count any errors in row and append the row
                errors = errors + validate_row(row, pageno)
                page.append(row)

        if page:
            result[pageno] = page
            page = []
    return {
        'transcript': result,
        'errors': errors
    }


def validate_row(row, pageno):
    """Prints error information about a markdown row and returns the number of
    errors found.

    Keyword arguments:
    row -- the row as list to be validated
    pageno -- the episode's page number this is for
    """
    errors = 0
    if len(row) < 4 or len(row) > 5:
        print('**** ERROR: On page ' + pageno +
              ', there must be 4-5 columns in row: ' +
              '|'.join(row) + ' ****')
        errors = errors + 1
    else:
        if not row[1].isdigit():
            print('**** ERROR: On page ' + pageno +
                  ', second column |' + row[1] +
                  '| must be a positive whole number in: ' +
                  '|'.join(row) + ' ****', file=sys.stderr)
            errors = errors + 1
        if row[2] != 'True' and row[2] != 'False':
            print('**** ERROR: TYPO! On page ' + pageno + ', |' +
                  row[2] + '| must be |True| or |False| for ' +
                  '|'.join(row) + ' ****', file=sys.stderr)
            errors = errors + 1
        if len(row) == 5 and row[4] != 'nowhitespace':
            print('**** ERROR: TYPO! On page ' + pageno + ', |' +
                  row[4] + ' must be |nowhitespace or empty for ' +
                  '|'.join(row) + ' ****', file=sys.stderr)
            errors = errors + 1
    return errors


def write_transcript(episode_number, locale, directory, transcript, notes):
    """Writes pages and their lines to markdown transcript.

    The 'transcript' data structure looks like this:

        {
            '00' : [
                [ 'Title', 1, 'False', 'Episode 1: The Potion of Flight' ]
            ],
            '01' : [
                [ 'Pepper', 1, 'False', '...and the last touch' ]
                [ 'Pepper', 4, 'False', '...mmm probably not strong enough' ]
                [ 'Sound', 2, 'True', 'SHH' ]
                [ 'Sound', 3, 'False', 'SHH' ]
                [ 'Sound', 5, 'True', 'PLOP' ]
                [ 'Sound', 6, 'False', 'PLOP' ]
            ],
            ...
        }

    Keyword arguments:
    episode_number -- episode number for creating the filename, e.g. 01
    locale -- the locale for the transcriot filename, e.g. fr
    directory -- The directory to write the file to
    transcript -- a data structure as shown above
    notes -- a string of text lines to be added as contents to the "Notes" section
    """

    transcript_path = directory / make_transcript_filename(episode_number, locale)

    lines = []
    for page in sorted(transcript.keys()):
        lines.append('\n### P' + page + '\n')
        lines.append(TABLE_HEADER)
        lines.append(TABLE_HEADER_FORMATTER)
        lines = lines + transcript[page]

    if lines:
        with open(transcript_path.as_posix(), 'w', encoding='utf-8', newline='\n') \
                as destinationfile:

            destinationfile.write(
                '# Transcript of Pepper&Carrot Episode ' + episode_number + ' [' + locale + ']\n\n')
            destinationfile.write('## Notes\n\n')
            destinationfile.write(notes + '\n')
            destinationfile.write('## Pages\n')
            destinationfile.write('\n'.join(lines) + '\n')

    print('Wrote', len(transcript), 'pages to', transcript_path)


def read_notes(notespath, transcriptpath):
    """Reads ## Notes section from transcript. If transcript is not available
    yet or Nores section is empty, reads notes from notes.md instead.

    Keyword arguments:
    scriptpath -- the directory where the notes.md file is
    transcriptpath -- the path for the transcript file to read, or None
    """

    result = ''
    if transcriptpath and transcriptpath.exists() and transcriptpath.is_file():
        print('Reading notes from', transcriptpath.name)
        with open(transcriptpath.as_posix(), 'r', encoding='utf-8') as sourcefile:
            in_notes_section = False
            for line in sourcefile.readlines():
                if line.strip() == '## Notes':
                    in_notes_section = True
                elif line.strip() == '## Pages' or line.startswith('### P0'):
                    break
                elif in_notes_section:
                    result = result + line
    if result.strip() == '':
        print('Using default notes')
        with open(os.path.dirname(notespath) + '/notes.md', 'r', encoding='utf-8') as notesfile:
            for line in notesfile.readlines():
                result = result + line
    return result.strip() + '\n'
