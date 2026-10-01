#!/usr/bin/env python3
# encoding: utf-8
#
#  extract_custom.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2019 GunChleoc <fios@foramnagaidhlig.net>
#  SPDX-FileCopyrightText: © 2021 David Revoy <info@davidrevoy.com>
#  SPDX-FileCopyrightText: © 2023 Andrej Ficko

"""Tool for extracting text contents from SVG files and writing them to
markdown. This is the custom source & destination locale version!
It was made to help with the process of converting Markdown files not based on English.
This includes the new episodes that are based on French.

If you are reading this and wondering, let me explain when this is necesary.
The normal script reads the English Markdown as the source reference.
Without this reference, all extracted strings are referenced as <unknown>.
Same goes for reference names also, resulting in unupdated names.

This script reads two translation .po files and customly combines
its content for the names of the references. Markdown is based on source locale.
If the target Markdown file already exists, the existing text is simply updated.
Finally, it extracts text from .svg files and combines all the above to save the target Markdown file.

Read https://www.peppercarrot.com/xx/documentation/062_Transcripts.html"""

import os.path
from pathlib import Path
import re
import sys
import xml.etree.ElementTree
from markdown import extract_episode_number, make_transcript_filename, \
    read_notes, read_transcript, write_transcript
from extract_text import extract_text_from_page, main as extract_text
from svg import read_svg
from polib import pofile


def read_reference(basedir, loc_dest, loc_source, episode_number):
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
    transcript_path = basedir / loc_dest / \
        make_transcript_filename(episode_number, loc_dest)

    if not (transcript_path.exists() and transcript_path.is_file()):
        # special behaviour for regenerate_transcripts.py
        if loc_source.endswith("_") and loc_source.startswith("_"):
            loc_source = loc_source.strip("_")
            transcript_path = basedir / loc_dest / make_transcript_filename(episode_number, loc_source)
        else:
            transcript_path = basedir / loc_source / make_transcript_filename(episode_number, loc_source)

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


def dic_entry_check (msgid, msgstr):
    if msgstr != '':
        return msgstr # Feed the array with the translation
    else:
        return msgid # Feed the array with a fallback (English keyword)

def dic_cleanup_strings (entry):
    # Cleanup strings input: (eg. turn '(Miss) Saffron' into 'Saffron')
    return re.sub(r'(\(.+\))', r'', entry).strip()

def read_dictionary(directory, loc_dest, loc_source):
    """Read names translations from PO files in '1_translation-names-references'.

    Keyword arguments:
    directory -- the files' directory, e.g./home/pepperandcarrot/webcomics
    loc_source, loc_dest -- the locales to be parsed, e.g. 'fr', 'oc'

    It returns an array dictionary like:   {loc_source: loc_dest}
    Names: {'[fr] Français': '[oc] Occitan', 'Écriture': 'Escritura', 'Narrateur': 'Narrator', 'Note': 'Nòta', 'et': 'e', 'Carrot': 'Carròt', 'Vendeur': 'Vendaire'}
    """
    result = {}

    # Create path to Po files, and a fallback
    sourcefile = directory + '/1_translation-names-references/' + loc_source + '.po'
    destinationfile = directory + '/1_translation-names-references/' + loc_dest + '.po'
    fallbackfile = directory + '/1_translation-names-references/en.po'
    po_fallback = pofile(fallbackfile)
    po_single = None
    po_single_reverse = False

    if os.path.exists(destinationfile):
        po_dst = pofile(destinationfile)
        if os.path.exists(sourcefile) and not loc_source == 'en':
            po_src = pofile(sourcefile)
            dic_src = {}
            dic_dst = {}
            for e in po_src:
                dic_src[e.msgid] = dic_entry_check(e.msgid, e.msgstr)
            for e in po_dst:
                dic_dst[e.msgid] = dic_entry_check(e.msgid, e.msgstr)
            for entry in po_fallback:
                e = entry.msgid
                keyword = dic_cleanup_strings(dic_src.get(e,e))
                translation = dic_cleanup_strings(dic_dst.get(e,e))
                result[keyword] = translation
        else:
            po_single = po_dst
    else:
        if os.path.exists(sourcefile):
            po_single = pofile(sourcefile)
            po_single_reverse = True
        else:
            po_single = po_fallback

    if po_single:
        for entry in po_single:
            keyword = dic_cleanup_strings(entry.msgid)
            translation = dic_cleanup_strings(entry.msgstr)
            if not po_single_reverse:
                result[keyword] = dic_entry_check(keyword, translation)
            else:
                result[dic_entry_check(keyword, translation)] = keyword

    return result


def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha() and lang.islower()

def main(argv):
    """Get episode name and locale from command line, then iterate over the SVG
    files and extract their texts to Markdown.

    Usage:   0_transcripts/extract_text.py <episode> <locale>
    Example: 0_transcripts/extract_text.py ep01_Potion-of-Flight fr


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
    directory_root = Path(os.path.dirname(scriptpath)).parent.resolve() # resolve is default behaviour

    # The first argument is the script name itself, we expect 4 minimum arguments for the script to launch
    # If the full path is given as an argument, the required data will be extracted. (drag&drop input method)
    # (if the destination directory is not given, the script will generate it automatically).
    if len(argv) == 2:
        input_path = Path(os.path.abspath(argv[1])).resolve() # resolves hyperlink path, just like in scriptpath
        if str(directory_root) in str(input_path):
            input_relative = input_path.relative_to(directory_root).parts# [episode, "lang", locale, md_file]
            epnum = extract_episode_number(input_relative[0])
            if len(input_relative) >= 4 and epnum:
                if input_relative[1] == 'lang' and is_valid_lang_name(input_relative[2]):
                    md_file = input_relative[3]
                    if md_file.endswith("_transcript.md") and md_file.startswith("ep"+epnum+"_"):
                        md_lang = md_file.split("_")[1]
                        argv = argv[:1] + [input_relative[0], "_"+md_lang+"_", input_relative[2]] # replacing arguments

    if len(argv) < 4:
        print('Wrong number of arguments! Usage:')
        print('    0_transcripts/extract_custom.py <episode> <locale_source> <locale_destination> <destinationdirectory(optional,absolute path)>')
        print('For example:')
        print('    0_transcripts/extract_custom.py ep01_Potion-of-Flight fr oc')
        print('Or:')
        print('    0_transcripts/extract_custom.py ep01_Potion-of-Flight oc ga /destination/path/of/your/choice')
        print('')
        print('  There is an extra feature for inherited Markdown:')
        print('       0_transcripts/extract_custom.py ep19_Pollution _fr_ oc')
        print('       will process file: ep19_Pollution/lang/oc/ep19_fr_transcript.md')
        print('')
        print('  Alternatively you can use a single argument (or drag&drop file) with a full path.')
        print('    Only works with .md files; locale_source in filename; locale_destination in folder')
        print('     e.g. /home/user/peppercarrot/webcomics/ep11_The-Witches-of-Chaosah/lang/oc/ep11_fr_transcript.md')
        print('      or  C:\\\\Users\\\\User\\\\Documents\\\\webcomics\\\\ep38_The-Healer\\\\lang\\\\ga\\\\ep11_oc_transcript.md')
        if os.path.isabs(argv[0]):
            input('\n     Press Enter to end... ')
        sys.exit(1)

    episode = argv[1]
    loc_source = argv[2]
    loc_dest = argv[3]

    if loc_source.strip("_") == loc_dest:
        print("Locales are the same. ("+loc_dest+") Calling 'extract_text.py'")
        argv[2] = argv[2].strip("_")
        extract_text(argv[:3])
        sys.exit(0)


    print("Episode '" + episode + "', locale '" + loc_source + "' -> '" + loc_dest + "'")

    # Only continue if we can identify the episode number from the episode name
    episode_number = extract_episode_number(episode)
    if episode_number == '':
        sys.exit(1)

    # Navigate to the episode's lang folder
    directory = directory_root / episode / 'lang'

    # Get reference markdown transcript
    reference_transcript = read_reference(directory, loc_dest, loc_source, episode_number)

    # special behaviour for regenerate_transcripts.py
    if loc_source.endswith("_") and loc_source.startswith("_"):
        loc_source = loc_source.strip("_")

    # Get names translations from dictionary file.
    print('Fetching names translations')
    names = read_dictionary(directory_root.as_posix(), loc_dest, loc_source)

    # Navigate to the episode's locale's folder
    dir_dest = directory / loc_dest
    directory = directory / loc_source

    print('Directory:', dir_dest)

    # Find all panel SVGs and extract their texts
    pagefile_regex = re.compile(r'E\d+P(\d+)\.svg')

    transcript = {}
    for filename in sorted(dir_dest.iterdir()):
        match = pagefile_regex.fullmatch(filename.name)
        if match and len(match.groups()) == 1:
            pagenumber = match.groups()[0]

            print(
                '======================================================================')
            print('Extracting texts from ' + filename.name)
            rows = extract_text_from_page(
                dir_dest.as_posix(),
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
    if len(argv) == 5:
        destdirectory = argv[4]
        destdirectory = Path(destdirectory)
        directory = destdirectory
        print('==> Debug, destination path found:', destdirectory)
        print('Directory:', directory)
        if not os.path.isdir(destdirectory):
            os.mkdir(destdirectory)

    # Write to file
    write_transcript(episode_number, loc_dest, dir_dest, transcript, notes)
    print('######################################################################')

# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main(sys.argv))
