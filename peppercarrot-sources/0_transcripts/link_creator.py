#!/usr/bin/env python3
# encoding: utf-8
#
#  link_creator.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2023 Andrej Ficko

"""
(🇩🇪 Der Name ist das Programm) As the name suggests, this script creates links...
Symbolic links from the Pepper&Carrot webcomic folder to make it easier to find your way around
   when making different corrections in one language,
   or when doing specific tasks like correcting a page in all languages.

The default destination path is next to "webcomic" folder, as "webcomics-linked".
   Works on Linux and Windows, with sufficient permissions and FS ability to create symlinks.

Run it without arguments to see the other part of the manual. (or see line 115)

Sample output for arguments: de sl fr
./de/(E01P00-E38P09).svg
./fr/(E01P00-E38P09).svg
./sl/(E01P00-E38P09).svg
./gfx_Pepper-and-Carrot_by-David-Revoy_(E01P00-E38P09).png

Sample output for: e31p03
./E31P03/(ca-vi)_E31P03.svg
./gfx_Pepper-and-Carrot_by-David-Revoy_E31P03.png

Sample output for: es 03-6
./es/(E03P00-E06P10).svg
./gfx_Pepper-and-Carrot_by-David-Revoy_(E03P00-E06P10).png

'all trans' links all transcript files to ./transcript/
'fr trans' links fr transcripts to ./transcript/
'en svg trans' links transcript files to ./en/ together with .svg files
(same behaviour for 'all json', 'fr svg json')

Note: link creation might require higher permission in Windows
"""

from pathlib import Path
import os, json, sys, re

# based on https://svn.blender.org/svnroot/bf-blender/trunk/blender/build_files/scons/tools/bcolors.py
# and https://gist.github.com/rene-d/9e584a7dd2935d0f461904b9f2950007
class bcolors:
    pathC = "/"
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
        pathC = "\\"
        if int(sys.getwindowsversion().build) < 19041 :
            HEADER, OKBLUE, OKCYAN, OKGREEN, WARNING, FAIL, ENDC, BOLD, UNDERLINE = '','','','','','','','',''
        kernel32 = __import__("ctypes").windll.kernel32
        kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        del kernel32


def makedir (fl):
    if not os.path.isdir(fl):
        os.mkdir(fl)
        print ("new folder: "+bcolors.WARNING+str(fl)+bcolors.ENDC)

def makelink (src, dst):
    if not os.path.exists(dst):
        if os.path.exists(src):
            os.symlink(src, dst)
            print("new link: $R"+bcolors.pathC+bcolors.OKCYAN+os.path.relpath(src,directory)+bcolors.ENDC+bcolors.BOLD+" -> "+bcolors.ENDC+"$L"+bcolors.pathC+bcolors.OKGREEN+os.path.relpath(dst,linkdir)+bcolors.ENDC)

def makelink_replace (src, dst):
    if os.path.exists(src):
        if os.path.exists(dst):
            os.remove(dst)
        os.symlink(src, dst)
        print("linked: $R"+bcolors.pathC+bcolors.OKCYAN+os.path.relpath(src,directory)+bcolors.ENDC+bcolors.BOLD+" -> "+bcolors.ENDC+"$L"+bcolors.pathC+bcolors.OKBLUE+os.path.relpath(dst,linkdir)+bcolors.ENDC)
        #print("linked: $G/"+os.path.relpath(src,directory)+" -> $L/"+os.path.relpath(dst,linkdir))

def download_file (url, file, dst_dir):
    if not os.path.exists(dst_dir/file):
        open(dst_dir/file, 'wb').write(requests.get(url+file).content)
        print("Downloading: '"+bcolors.WARNING+url+bcolors.OKGREEN+file+"'"+bcolors.ENDC)

# from markdown.py by GunChleoc
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

def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha()

argv = ['']
if len(sys.argv) < 2:
    print('This is how arguments are used:')
    print('    0_transcripts/link_creator.py <arguments in any order> <destination directory(optional,absolute path)>')
    print('    All links will be created next to "webcomics" as "webcomics-linked" (if not specified otherwise).')
    print('')
    print('Mode arguments:')
    print('    lowres/low-res - link (replace) .png from ./lang/')
    print('    hires / hi-res - link (replace) .png from ./hi-res/gfx-only/lossless/ (if exists)')
    print('    png - link (add) .png from ./lang/')
    print('    svg - link (add) all (filtered) .svg from ./lang/*/')
    print('')
    print('    all - use all languages from langs.json')
    print("    readme - link episode readme to a single folder")
    print("    separate - link local code folder directly per episode, e.g. en -> EN_04,EN_05...")
    print("    if none listed, default is: svg png")
    print('')
    print('Operation modes that use their own folder, but if combined with "svg", files go to locale:')
    print('    json - info.json from ./lang/*/')
    print('    trans(cript) - link (add) (filtered) transcripts')
    print('')
    print('Filter arguments:')
    print('    number - episode number, if not specified, all are accepted')
    print('    #-## - number filter in range form')
    print('    2 letters - local code, "all" can be used')
    print('    e##p## - (standalone) generate links for specific page, e.g. "e14p05" -> "en_E14P05","fr_E...')
    print('')
    print('    last argument (more than 8 characters) - target directory (absolute path)')
    print("Note (Linux): If you use 'sed' on these links, they'll be converted to a normal (copied) file.")
    if os.path.isabs(sys.argv[0]):
        argv = input('\n  You may now enter your arguments: ').split(" ")
    if argv == ['']:
        sys.exit(1)
else:
    argv = sys.argv[1:]

scriptpath = os.path.abspath(__file__)
directory = Path(os.path.dirname(scriptpath)).parent
linkdir = directory.parent / 'webcomics-linked'

mode=[]
ep_filter=[]
lang_filter=[]
svg_filter=[]
for arg in argv:
    if arg.lower() in ("png","svg","readme","json","all","download","separate"):
        mode.append(arg.lower())
    elif arg.lower() in ('hires','hi-res'):
        mode.append("hires")
        print("If you don't get any output, it means you don't have (lossless) .png files")
        print("    in (episode_dir)"+bcolors.WARNING+"/hi-res/gfx-only/lossless/"+bcolors.ENDC+" (3GB total, about 10MB each)")
        print("  You can download them with command: '"+bcolors.WARNING+"link_creator.py"+bcolors.FAIL+" hi-res download "+bcolors.OKCYAN+"<optional EPnumber filter>"+bcolors.ENDC+"'")
    elif arg.lower() in ('low-res','lowres'):
        mode.append("lowres")
    elif arg.lower() in ('trans','transcript'):
        mode.append("transcript")
    elif arg.isnumeric():
        ep_filter.append(f"{int(arg):02}")
    elif is_valid_lang_name(arg):
        lang_filter.append(arg.lower())
    elif re.compile(r'E\d+P(\d+)').fullmatch(arg.upper()):
        svg_filter.append(arg.upper())
    elif re.compile(r'\d+-(\d+)').fullmatch(arg):
        arg_split = arg.split("-")
        ep_filter += list(map(lambda x: f"{x:02}", range(int(arg_split[0]), int(arg_split[1])+1)))
    elif len(arg) > 8 and arg == argv[-1]:
        linkdir = Path(arg)
        print('==> Debug, destination path found:', linkdir)
        print('Source directory:', directory)
        makedir(linkdir)
    else:
        print ('Err: Argument "'+arg+'" is not recognized. (Typo?)')
        print("If it's supposed to be a path, it's either not last or shorter than 11 chars.")
        sys.exit(1)

makedir(linkdir)
if svg_filter:
    mode.append("svg_filter")
    for l in svg_filter:
        makedir(linkdir / l)
if not mode:
    mode = ["svg","png"]

if "all" in mode:
    with open(directory / 'langs.json', 'r', encoding="utf-8") as json_file:
        lang_filter=json.load(json_file).keys()

if "svg" in mode and not svg_filter:
    for l in lang_filter:
        makedir(linkdir / l)
if "readme" in mode:
    makedir(linkdir / "readme")
if "json" in mode and "svg" not in mode:
    makedir(linkdir / "json")
if "transcript" in mode and "svg" not in mode:
    makedir(linkdir / "transcript")
if "download" in mode:
    try:
        import requests
    except:
        print("\nYou need a library to do that. Try: 'pip install requests'")
        sys.exit(1)

print(bcolors.WARNING+"$R"+bcolors.ENDC+" = " +bcolors.OKCYAN+ str(directory) +bcolors.ENDC+ " | "+bcolors.WARNING+"$L"+bcolors.ENDC+" = " +bcolors.OKGREEN+ str(linkdir) +bcolors.ENDC)

for episode in sorted(os.listdir(directory)):
    if episode.startswith("ep"):
        epnum = extract_episode_number(episode)
        if not ep_filter or epnum in ep_filter:
            langdir = directory / episode / 'lang'
            dirlist = os.listdir(langdir)
            for lang in dirlist:
                if lang.endswith(".png"):
                    if "png" in mode:
                        makelink(langdir/lang, linkdir/lang)
                    elif "lowres" in mode:
                        makelink_replace(langdir/lang, linkdir/lang)
                    elif "svg_filter" in mode:
                        if lang[37:-4] in svg_filter:
                            makelink(langdir/lang, linkdir/lang)

                elif "svg" in mode:
                    if lang in lang_filter:
                        for v in sorted(os.listdir(langdir / lang)):
                            if v.endswith(".svg"):
                                makelink(langdir / lang / v, linkdir / lang / v)
                            elif "json" in mode and v == "info.json":
                                makelink(langdir / lang / v, linkdir / lang / ("E"+epnum+"_info.json"))
                            elif "transcript" in mode and v.endswith(".md"):
                                transcript_file = 'ep'+epnum+'_'+lang+'_transcript.md'
                                makelink(langdir / lang / transcript_file, linkdir / lang / transcript_file.replace("ep","E"))

                elif "svg_filter" in mode:
                    for v in sorted(os.listdir(langdir / lang)):
                        if v[0:-4] in svg_filter:
                            makelink(langdir / lang / v, linkdir / v[0:-4] / (lang+"_"+v))
                elif "json" in mode:
                    if lang in lang_filter:
                        makelink(langdir / lang / "info.json", linkdir / "json" / (lang.upper()+"_E"+epnum+"_info.json"))
                elif "transcript" in mode:
                    if lang in lang_filter:
                        transcript_file = 'ep'+epnum+'_'+lang+'_transcript.md'
                        makelink(langdir / lang / transcript_file, linkdir / "transcript" / transcript_file)

                if "separate" in mode:
                    if lang in lang_filter:
                        makelink(langdir/lang, linkdir/(lang.upper()+"_E"+epnum))

            if "hires" in mode:
                lossless_dir = directory / episode / "hi-res" / "gfx-only" / "lossless"
                if "download" in mode:
                    if not os.path.exists(lossless_dir):
                        os.makedirs(lossless_dir) # recursive mkdir for deepth of 3
                    url = "https://www.peppercarrot.com/0_sources/"+episode+"/hi-res/gfx-only/lossless/"
                    cover = "gfx_Pepper-and-Carrot_by-David-Revoy_E"+epnum+".png"
                    download_file(url, cover, lossless_dir)
                    for lang in dirlist:
                        if lang.endswith(".png"):
                            download_file(url, lang, lossless_dir)
                if os.path.isdir(lossless_dir):
                    for lossless_file in os.listdir(lossless_dir):
                        if lossless_file.endswith(".png"):
                            makelink_replace(lossless_dir/lossless_file, linkdir/lossless_file)

            if "readme" in mode:
                makelink(directory / episode / "README.md", linkdir / "readme" / ("EP"+epnum+"_README.md"))

if os.path.isabs(sys.argv[0]):
    input('\n    Done! Press Enter to end... ')
