#!/usr/bin/env python3
# encoding: utf-8
#
# svg_dimension_checker.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2023 Andrej Ficko

import xml.etree.ElementTree, os, sys, re
from pathlib import Path

scriptpath = os.path.abspath(__file__)
directory = Path(os.path.dirname(scriptpath)).parent

"""
This tool is ment to fix problems that result in wrong selection
when converting old translation file in Inkscape. This is the correct one:
https://www.peppercarrot.com/data/documentation/medias/img/convert-legacy-inkscape-file.jpg

Each .svg file is compared to the FR reference ("normal" resolution without viewBox)
* viewBox is an Inkscape function (as inner resolution) to scale document to output resolution

If the (known) resolution mismatch cannot be detected, an anomaly is reported.
There are 3 types of problems that can occur (and that this tool can detect & fix):

Type 1:
  Output resolution increased, inner resolution unchanged
  (resolution + 6.66% | added viewBox with normal resolution)

  Fix: Set output resolution to normal

Type 2: (soft anomaly after a fix)
  Whole document is scaled to the increased resolution
  (resolution + 6.66% | no viewBox)

  Fix: Set output resolution to normal, add viewBox with + 6.66% resolution
 !Note: Output if fixed, but scaled elements remain batch incompatible

Type 3:
  Element position not changed, output and inner resolution increased,
  bottom and right borders added (because element position does not match viewBox)
  (resolution + 13.77% | added viewBox with resolution + 6.66%)

  Fix: set output resolution and viewBox to normal


Usage: python 0_transcripts/link_creator.py <arguments>
   (it is possible to just run script and enter arguments)

<locale> can be a 2-letter language code (such as fr or en) or an episode number.
Multiple (filter) arguments are possible and numbers can be used as range (2-12).
Defaults: languages - none | episodes - all

If you wish to check all languages, add argument "all".
To activate fixing, add argument "fix".
To also see fixed Type 2 anomalies and other odd viewBox, add "ty2".
"""

# based on https://svn.blender.org/svnroot/bf-blender/trunk/blender/build_files/scons/tools/bcolors.py
# and https://gist.github.com/rene-d/9e584a7dd2935d0f461904b9f2950007
class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    if __import__("platform").system() == "Windows":
        if int(sys.getwindowsversion().build) < 19041 :
            HEADER, OKBLUE, OKCYAN, OKGREEN, WARNING, FAIL, ENDC, BOLD, UNDERLINE = '','','','','','','','',''
        kernel32 = __import__("ctypes").windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        del kernel32

def extract_episode_number(episode):  # from markdown.py
    # e.g. "ep01_Potion-of-Flight" -> "01"
    match = re.compile(r'.*ep(\d+)_').match(episode)
    if match and len(match.groups()) == 1:
        return match.groups()[0]
    print('ERROR: Unable to extract episode number from:', episode, file=sys.stderr)
    return ''

def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha()


def fix_svg_dimension (filedir, ref_size, width, height, viewBox):
    svg_data = ""
    with open(filedir, 'r', encoding="utf-8") as svg_file:
        svg_data = svg_file.read()

    # Check if the data we are modifying is in a single line.
    if svg_data.find('width="'+width) and svg_data.find('height="'+height):
        svg_ok = True
        svg_data = svg_data.replace('width="'+width, 'width="'+ref_size[0], 1)

        # fix for type 1 & 3
        if not svg_data.find('viewBox="'+str(viewBox)) == -1:
            svg_data = svg_data.replace('height="'+height, 'height="'+ref_size[1], 1)
            svg_data = svg_data.replace('viewBox="'+str(viewBox), 'viewBox="0 0 '+ref_size[0] +" "+ref_size[1], 1)

        # fix for type 2
        elif viewBox == None:
            svg_data = svg_data.replace('height="'+height, 'height="'+ref_size[1]+'"\n   viewBox="0 0 '+width+" "+height, 1)

        # an error that will probably never occur
        else:
            svg_ok = false
            print ("   ***"+bcolors.FAIL+"error2"+bcolors.ENDC+"*** "+lang.upper()+" - "+f+" could not be fixed!")

        if svg_ok:
            with open(filedir, 'w', encoding="utf-8", newline='\n') as svg_file:
                svg_file.write(svg_data)
    else:
        print ("   ***"+bcolors.FAIL+"error1"+bcolors.ENDC+"*** "+lang.upper()+" - "+f+" could not be fixed!")


def check_svg_dimensions (langdir, lang, ref_sizes, fix_dimensions, soft_anomaly):
    for f in sorted(os.listdir(langdir / lang)):
        if f.endswith(".svg"):
            root = xml.etree.ElementTree.parse(langdir / lang / f).getroot()
            width = root.attrib.get('width') # "x"
            height = root.attrib.get('height') # "y"
            viewBox = root.attrib.get('viewBox')  # "0 0 x y"
            ref_size = ref_sizes[f] # ("x", "y")

            if not ref_size == (width, height):
                ref_size_float = list(map(lambda x: round(float(x)),ref_size))
                dimension_diag = lang.upper()+" - "+f+ ": "+width+"x"+height+ "  (ref: "+ref_size[0]+"x"+ref_size[1]+")"
                if viewBox:
                    dimension_diag += "  viewBox="+viewBox

                if ref_size_float == [round(float(width)/96*90), round(float(height)/96*90)]:
                    if viewBox == "0 0 "+ref_size[0] +" "+ref_size[1]:
                        print ("*Type 1* " + dimension_diag)
                        if fix_dimensions:
                            fix_svg_dimension (langdir / lang / f, ref_size, width, height, viewBox)

                    elif viewBox == None:
                        print ("*Type 2* " + dimension_diag)
                        if fix_dimensions:
                            fix_svg_dimension (langdir / lang / f, ref_size, width, height, viewBox)

                    else:
                        print ("**"+bcolors.FAIL+"viewBox anomaly"+bcolors.ENDC+"** " + dimension_diag)

                elif ref_size_float == [round(float(width)/96*90/96*90), round(float(height)/96*90/96*90)] and ref_size_float == [round(float(viewBox.split(" ")[2])/96*90), round(float(viewBox.split(" ")[3])/96*90)]:
                    print ("*Type 3* " + dimension_diag)
                    if fix_dimensions:
                        fix_svg_dimension (langdir / lang / f, ref_size, width, height, viewBox)

                else:
                    print ("**"+bcolors.FAIL+"Dimension anomaly"+bcolors.ENDC+"** " + dimension_diag)

            # Find odd viewBox even if dimension is OK. (needs attribute "ty2")
            elif soft_anomaly and viewBox:
                ref_size_float = list(map(lambda x: round(float(x)),ref_size))
                soft_anomaly_print = "*"+bcolors.WARNING+"Soft anomaly "+bcolors.ENDC+ lang.upper()+" - "+f+ " ("+width+"x"+height+") viewBox="+viewBox+" | "
                if ref_size_float == [round(float(viewBox.split(" ")[2])/96*90), round(float(viewBox.split(" ")[3])/96*90)]:
                    print (soft_anomaly_print +bcolors.WARNING+ "Fixed Type 2" +bcolors.ENDC)
                elif not ref_size_float == [round(float(viewBox.split(" ")[2])), round(float(viewBox.split(" ")[3]))]:
                    print (soft_anomaly_print +bcolors.FAIL+ "Unknown viewBox!" +bcolors.ENDC)


def dimension_checker (args):
    ep_filter=[]
    lang_filter=[]
    all_langs = False
    fix_dimensions = False
    soft_anomaly = False
    for arg in args:
        if arg.isnumeric():
            ep_filter.append(f"{int(arg):02}")
        elif re.compile(r'\d+-(\d+)').fullmatch(arg):
            arg_split = arg.split("-")
            ep_filter += list(map(lambda x: f"{x:02}", range(int(arg_split[0]), int(arg_split[1])+1)))
        elif arg.lower() == "all":
            all_langs = True
        elif arg.lower() == "fix":
            fix_dimensions = True
        elif arg.lower() == "ty2":
            soft_anomaly = True
        elif is_valid_lang_name(arg):
            lang_filter.append(arg.lower())
        else:
            print ('Err: Argument "'+arg+'" is not recognized. (Typo?)')
    if lang_filter == [] and len(ep_filter) == 1:
        all_langs = True

    for episode in sorted(os.listdir(directory)):
        if episode.startswith("ep") or episode.startswith("new-ep"):
            epnum = extract_episode_number(episode)
            if not ep_filter or epnum in ep_filter:
                langdir = directory / episode / "lang"
                ref_sizes = {}
                reference_langdir = langdir / 'fr'
                for rf in sorted(os.listdir(reference_langdir)):
                    if rf.endswith(".svg"):
                        root = xml.etree.ElementTree.parse(reference_langdir / rf).getroot()
                        ref_sizes[rf] = (root.attrib.get('width'), root.attrib.get('height'))
                if all_langs:
                    for lang in os.listdir(langdir):
                        if (langdir / lang).is_dir():
                            check_svg_dimensions(langdir, lang, ref_sizes, fix_dimensions, soft_anomaly)
                else:
                    for lang in lang_filter:
                        if os.path.isdir(langdir / lang):
                            check_svg_dimensions(langdir, lang, ref_sizes, fix_dimensions, soft_anomaly)


def main (argv):
    args = ['']
    if len(argv) < 2:
        print('This is how arguments are used:')
        print('    0_transcripts/svg_dimension_checker.py <arguments>')
        print('    Arguments can be: locale, episode (number or range), "all", "fix"')
        print('')
        print('For example:')
        print('    0_transcripts/svg_dimension_checker.py fr de')
        print('    0_transcripts/svg_dimension_checker.py all 9 14')
        print('Or:')
        print('    0_transcripts/svg_dimension_checker.py fix jb jz sv')
        print('    0_transcripts/svg_dimension_checker.py fix da 1-16')
        print('    0_transcripts/svg_dimension_checker.py fix at 1-17')
        if os.path.isabs(argv[0]):
            args = input('\n  You may now enter your arguments (e.g. es 06): ').split(" ")
        if args == ['']:
            sys.exit(1)
    else:
        args = argv[1:]

    dimension_checker(args)

    if os.path.isabs(argv[0]):
        input('\n    Done! Press Enter to end... ')

if __name__ == '__main__':
    sys.exit(main(sys.argv))
