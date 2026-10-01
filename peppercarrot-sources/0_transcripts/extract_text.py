#!/usr/bin/env python3
# encoding: utf-8
#
#  extract_text.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2019 GunChleoc <fios@foramnagaidhlig.net>
#  SPDX-FileCopyrightText: © 2021 David Revoy <info@davidrevoy.com>
#  SPDX-FileCopyrightText: © 2023 Andrej Ficko

"""Tool for extracting text contents from SVG files and writing them to
markdown."""

import os.path
from pathlib import Path
import re
import sys
import xml.etree.ElementTree
from markdown import extract_episode_number, make_transcript_filename, \
    read_notes, read_transcript, write_transcript
from svg import read_svg
from polib import pofile


def read_reference(basedir, locale, episode_number):
    """Get Markdown reference file contents.

    If no file is found for the current locale, falls back to the 'en' locale.

    Returns a mapping with transcript path and transcript contents

        {
            "path" : transcript_path,
            "contents" : result
        }


    Keyword arguments:
    basedir -- the episode's lang directory, e.g. webcomics/ep01_Potion-of-Flight/lang
    locale -- the locale to be parsed, e.g. fr
    episode_number - the episode's number as string, e.g. 01
    """

    result = {}
    transcript_path = basedir / locale / \
        make_transcript_filename(episode_number, locale)

    if not (transcript_path.exists() and transcript_path.is_file()):
        transcript_path = basedir / 'en' / \
            make_transcript_filename(episode_number, 'en')

    if transcript_path.exists() and transcript_path.is_file():
        # Read file
        print("Using reference from '" +
              transcript_path.parent.stem + "' locale")
        transcript = read_transcript(transcript_path)
        if transcript['errors'] > 0:
            print('-> Error while reading reference transcript! ABORTING.', file=sys.stderr)
            sys.exit(1)
        else:
            result = transcript['transcript']
    else:
        # Even English does not exist yet, return empty.
        transcript_path = None
        print('-> No reference yet, please add character names to the result!')
    return {
        'path': transcript_path,
        'contents': result
    }

def read_dictionary(directory, locale):
    """Read names translations from PO files in '1_translation-names-references'.

    Keyword arguments:
    directory -- the files' directory, e.g./home/pepperandcarrot/webcomics
    locale -- the locale to be parsed, e.g. fr

    It returns an array dictionary like:
    Names: {'[en] English': '[fr] Français', 'Pepper': 'Pepper', 'Carrot': 'Carrot', 'Saffron': 'Safran', 'Truffel': 'Truffel', 'Coriander': 'Coriandre'}
    """
    result = {}

    # Create path to Po files, and a fallback
    referencefile = directory + '/1_translation-names-references/' + locale + '.po'
    fallbackfile = directory + '/1_translation-names-references/en.po'

    # If the Po file exist
    if os.path.exists(referencefile):
      # Parse all its entries for reference
      po = pofile(referencefile)
    else:
      # Parse entries of a fallback
      po = pofile(fallbackfile)

    # Loop on all entries parsed:
    for entry in po:
      # Cleanup strings input: (eg. turn '(Miss) Saffron' into 'Saffron')
      keyword = re.sub(r'(\(.+\))', r'', entry.msgid).strip()
      translation = re.sub(r'(\(.+\))', r'', entry.msgstr).strip()

      if translation != '':
        # Feed the array with the translation
        result[keyword] = translation
      else:
        # Feed the array with a fallback (English keyword)
        result[keyword] = keyword

    return result


def extract_text_from_page(localedir, pagenumber, filename, names, transcript):
    """Read text from SVG file and write to Markdown.

    Keyword arguments:
    localedir -- the files' directory,
                 e.g. /home/peppercarrot/webcomics/ep01_Potion-of-Flight/lang/fr
    pagenumber -- the page number to be extracted, e.g. 00
    filename -- the SVG file's base filename, e.g. E01P00.svg
    names -- mapping of English to translated names
    transcript -- lines from a reference transcript, or empty {}

    Returns an array of transcript lines, or None if no text was found
    """

    result = []

    lines = read_svg(os.path.join(localedir, filename), {})

    if len(lines) < 1:
        print('No text found, aborting')
        return result

    # Get reference file contents
    reflines = []
    if pagenumber in transcript.keys():
        reflines = transcript[pagenumber]

    # Separate 'Shichimi & Coriander' into 'Shichimi' and 'Coriander' for translations
    names_regex = re.compile(r'(.+)\s&\s(.+)')

    # Format output using the reference file if available and write to csv
    concatenate = 'False'
    name = '<unknown>'
    position = 0

    for line in lines:
        # Get information about line from reference file
        refline = ''
        nowhitespace = False
        if reflines:
            refline = reflines.pop(0)
            if refline != '':
                name = refline[0]
                position = int(refline[1])
                concatenate = refline[2]
                nowhitespace = len(refline) > 4

                # Fetch names translations
                if name in names:
                    name = names[name]
                else:
                    match = names_regex.match(name)
                    if match and len(match.groups()) == 2:
                        name1 = match.groups()[0]
                        if name1 in names:
                            name1 = names[name1]
                        name2 = match.groups()[1]
                        if name2 in names:
                            name2 = names[name2]
                        ampersand = '&'
                        if ampersand in names:
                            ampersand = names[ampersand]
                        name = name1 + ' ' + ampersand + ' ' + name2

        # No reference available yet
        if refline == '':
            name = '<unknown>'
            position = position + 1
            concatenate = 'False'

        # Write non-empty lines
        if line != '':
            if nowhitespace:
                result.append(
                    '|'.join([name, str(position), concatenate, line, 'nowhitespace']))
            else:
                result.append(
                    '|'.join([name, str(position), concatenate, line]))

    if len(result) == 1:
        print('Found ' + str(len(result)) + ' line')
    else:
        print('Found ' + str(len(result)) + ' lines')

    return result


def is_valid_lang_name(lang: str) -> bool:
    """
    Check if the provided string has a length between 2 and 3 and is lowercase alpha
    """

    return 2 <= len(lang) <= 3 and lang.isalpha() and lang.islower()


def main(argv):
    """Get episode name and locale from command line, then iterate over the SVG
    files and extract their texts to Markdown.

    Usage:   0_transcripts/extract_text.py <episode> <locale> <destination directory(optional,absolute path)>
    Example: 0_transcripts/extract_text.py ep01_Potion-of-Flight fr
    Or: 0_transcripts/extract_text.py ep01_Potion-of-Flight fr /destination/path/of/your/choice

    Alternatively you can use a single argument (or drag&drop file) with a full path.
     e.g. /home/user/peppercarrot/webcomics/ep11_The-Witches-of-Chaosah/lang/fr
     or  C:\\Users\\User\\Documents\\webcomics\\ep38_The-Healer\\lang\\en
    and also works with links like: ...\\webcomics-linked\\fr\\E36P06.svg


    Output format for a page looks like this:

        Sound|4|True|Glup
        Sound|5|True|Glup
        Sound|6|False|Glup
        Writing|1|True|WARNING
        Writing|3|False|PROPERTY
        Writing|2|True|WITCH

    Column 1: Name of the character speaking, or "Title", "Writing", "Sound" etc.
              Use "<hidden>" to hide translators' instructions from extract_to_html.py
    Column 2: The desired line number in the final transcript
    Column 3: Whether this line will be concatenated with the following line
    Column 4: The text being spoken/written
    Column 4: (Optional) Suppress whitespace - see below

    Lines are in the order that the SVG file's code produces and we need column 2 to
    obtain the correct logical text order.
    Some texts go over multiple elements for formatting purposes and we use column3 for that.

    We can then run the CSV file though extract_to_html.py, which will give us
    the following lines with a bit of HTML formatting on top:

        Writing: WARNING WITCH PROPERTY
        Sound: Glup Glup Glup

    If you add |nowhitespace at the end of a row, extract_to_html.py will add the
    segment without any blank spaces. For example:

        Sound|3|True|up|nowhitespace
        Sound|2|True|pl|nowhitespace
        Sound|1|True|s
        Sound|6|False|up ! !|nowhitespace
        Sound|5|True|l|nowhitespace
        Sound|4|True|g

    Will result in:

        Sound: splup glup!!
    """

    print('#########################################################################')
    print('# Tool for extracting texts from SVG files and writing them to Markdown #')
    print('#########################################################################')

    # Get the repository's base directory
    scriptpath = os.path.abspath(__file__)
    directory = Path(os.path.dirname(scriptpath)).parent.resolve() # resolve is default behaviour

    # The first argument is the script name itself, we expect 3 minimum arguments for the script to launch
    # If the full path is given as an argument, the required data will be extracted. (drag&drop input method)
    # (if the destination directory is not given, the script will generate it automatically).
    if len(argv) == 2:
        if argv[1].count("/") == 1: # expected episode/locale - common typo on manual input
            in_arg = argv[1].split("/")
            if extract_episode_number(in_arg[0]) and is_valid_lang_name(in_arg[1]):
                argv = argv[:1] + in_arg

        else: # make drag&drop work (check and extract data from absolute path)
            input_path = Path(os.path.abspath(argv[1])).resolve() # resolves hyperlink path, just like in scriptpath
            if str(directory) in str(input_path):
                input_relative = input_path.relative_to(directory).parts # [episode, "lang", locale, *]
                if len(input_relative) >= 3 and extract_episode_number(input_relative[0]):
                    if input_relative[1] == 'lang' and is_valid_lang_name(input_relative[2]):
                        argv = argv[:1] + [input_relative[0], input_relative[2]] # replacing arguments

    if len(argv) < 3:
        print('\nWrong number of arguments! Usage:')
        print('    0_transcripts/extract_text.py <episode> <locale> <destination directory(optional,absolute path)>')
        print('For example:')
        print('    0_transcripts/extract_text.py ep01_Potion-of-Flight fr')
        print('Or:')
        print('    0_transcripts/extract_text.py ep01_Potion-of-Flight fr /destination/path/of/your/choice')
        print('')
        print('  Alternatively you can drag&drop file (or use a single argument) with a full path.')
        print('     e.g. /home/user/peppercarrot/webcomics/ep11_The-Witches-of-Chaosah/lang/fr')
        print('      or  C:\\\\Users\\\\User\\\\Documents\\\\webcomics\\\\ep38_The-Healer\\\\lang\\\\en')
        print('   and also works with links like: ...\\\\webcomics-linked\\\\fr\\\\E36P06.svg')
        print('')
        print('  If you still have problems using this script, there is an alternative:')
        print('   extract_text.py ep07_The-Wish ru   can be done with:')
        print('   regenerate_transcripts.py new ru 07   through interactive input.')
        if os.path.isabs(argv[0]):
            input('\n     Press Enter to end... ')
        sys.exit(1)

    episode = argv[1]
    locale = argv[2]

    print("Episode '" + episode + "', locale '" + locale + "'")

    # Only continue if we can identify the episode number from the episode name
    episode_number = extract_episode_number(episode)
    if episode_number == '':
        sys.exit(1)

    # Get names translations from dictionary file.
    print('Fetching names translations')
    names = read_dictionary(directory.as_posix(), locale)

    # Navigate to the episode's lang folder
    directory = directory / episode / 'lang'

    # Get reference markdown transcript
    reference_transcript = read_reference(directory, locale, episode_number)

    # Navigate to the episode's locale's folder
    directory = directory / locale

    print('Directory:', directory)

    # Find all panel SVGs and extract their texts
    pagefile_regex = re.compile(r'E\d+P(\d+)\.svg')

    transcript = {}
    for filename in sorted(directory.iterdir()):
        match = pagefile_regex.fullmatch(filename.name)
        if match and len(match.groups()) == 1:
            pagenumber = match.groups()[0]

            print(
                '======================================================================')
            print('Extracting texts from ' + filename.name)
            rows = extract_text_from_page(
                directory.as_posix(),
                pagenumber,
                filename.name,
                names,
                reference_transcript['contents'])
            if rows:
                transcript[pagenumber] = rows

    print('======================================================================')

    # Read ## Notes section or default notes
    notes = read_notes(scriptpath, reference_transcript['path'])

    # If a destination path is given, use that to change output directory
    if len(argv) == 4:
        destdirectory = argv[3]
        destdirectory = Path(destdirectory)
        directory = destdirectory
        print('==> Debug, destination path found:', destdirectory)
        print('Directory:', directory)
        if not os.path.isdir(destdirectory):
            os.mkdir(destdirectory)

    # Write to file
    write_transcript(episode_number, locale, directory, transcript, notes)
    print('######################################################################')

# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main(sys.argv))
