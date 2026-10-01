#!/usr/bin/env python3
# encoding: utf-8
#
#  svg.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019-2020 GunChleoc <fios@foramnagaidhlig.net>
#  Copyright 2023 Andrej Ficko

"""Extracts text from SVG - import the read_svg(filepath, attrib_filter)
function, all other functions are internal.

Optionally, you can filter texts for a list of attribute-value pairs.
The filter is somewhat primitive and only works with attributes on main-level
flowroot and text tags."""

import re
import xml.etree.ElementTree

"""These are exception settings for layer: blocklisted layer (label) names to skip,
allowlist (force) reads a text/flow with this id within the blocklisted layer (using intergrated filter).

If you don't want allowlist withing blocklisted layers, leave it empty ().
It is not adviced to use blocklist with less than 2 entries, use dummy entries ("",""). """

g_layer_blocklist_labels = ("notes", "translatornotes", "note", "transla-notes")
# "text4580-1-7-3-6" is 'Clap' & 'Ha' in EP 21 & 22 | "text4178-6-5-9-0-7-0-4" is book cover in EP19P04
g_child_allowlist_ids = ("text4580-1-7-3-6", "text4178-6-5-9-0-7-0-4")


# Hyphen regex constants
hyphenRule2 = re.compile(r'(.*\S+-)\s(\S.*)') # Replace "hyphenated- words" with "hyphenated-words"
hyphenRemove2 =re.compile(r'(.*\S+)-\s(\S.*)') # remove hyphen before space
hyphenRule3 = re.compile(r'(.*\S+)\s(-\S.*)') # Replace "hyphenated -words" with "hyphenated-words"
hyphenRemove3 =re.compile(r'(.*\S+)\s-(\S.*)') # remove hyphen after space

def format_line(line, TagID=""):
    """Strip duplicate whitespace and handle hyphens and escape |"""

    # Kill duplicate, leading and trailing whitespace
    line = re.sub(r'(\s+)', r' ', line).strip()

    # Replace "hyphenated- -words" with "hyphenated-words"
    hyphen = re.compile(r'(.*\S+-)\s-(\S.*)')
    match = hyphen.match(line)
    while match and len(match.groups()) == 2:
        line = match.groups()[0] + match.groups()[1]
        match = hyphen.match(line)

    # hyphen exception (remove if ID ends with "nohyphen"), see constants
    hyphen = hyphenRule2 if not TagID.endswith('nohyphen') else hyphenRemove2
    match = hyphen.match(line)
    while match and len(match.groups()) == 2:
        line = match.groups()[0] + match.groups()[1]
        match = hyphen.match(line)

    hyphen = hyphenRule3 if not TagID.endswith('nohyphen') else hyphenRemove3
    match = hyphen.match(line)
    while match and len(match.groups()) == 2:
        line = match.groups()[0] + match.groups()[1]
        match = hyphen.match(line)
    return line.replace('|', r'\|')


def read_tspans(tag):
    """Inner helper function for extracting texts from tspan elements in SVG
    files.

    tspan tags can be nested.

    Keyword arguments:
    tag -- an xml.etree.Element that potentially contains tspan Elements
    """
    line = ''
    for tspan in tag.findall('{http://www.w3.org/2000/svg}tspan'):
        if tspan.attrib.get('{http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd}role') == 'line':
            line = line + ' '
        if tspan.text:
            line = line + tspan.text
        # There can be a nested tag
        line = line + read_tspans(tspan)
        # And more text after the nested tags
        if tspan.tail:
            line = line + tspan.tail
    return line


def read_textpaths(tag):
    """Inner helper function for extracting texts from textPath elements in SVG
    files.

    Both textPath tags can be nested, and textPath can contain tspan too.

    Keyword arguments:
    tag -- an xml.etree.Element that potentially contains textPath Elements
    """
    line = ''
    for textpath in tag.findall('{http://www.w3.org/2000/svg}textPath'):
        if textpath.text:
            line = line + ' ' + textpath.text
        # There can be nested tags
        line = line + read_textpaths(textpath)
        line = line + read_tspans(textpath)
        # And more text after the nested tags
        if textpath.tail:
            line = line + textpath.tail
    return line


def check_filter(tag, attrib_filter):
    """Returns true if all ids in attrib_filter match the given value regex in the
    tag's attributes.

    Keyword arguments:
    tag -- an xml.etree.Element that potentially contains the filter attribute(s)
    attrib_filter -- a dict of {'attribute': re.compile('value')}
    """
    for key in attrib_filter:
        if not tag.attrib or not attrib_filter[key].match(tag.attrib[key]):
            return False
    return True


def read_text(tag, attrib_filter):
    """Outer helper function for extracting texts from XML text elements in SVG
    files.

    All text tags and their sub tags can be nested.

    Keyword arguments:
    tag --           an xml.etree.Element that potentially contains text Elements
    attrib_filter -- a dict of {'attribute': re.compile('value')}
    """
    line = ''
    for text in tag.findall('{http://www.w3.org/2000/svg}text'):
        # Get nested text tags
        if not check_filter(text, attrib_filter):
            continue
        line = line + ' ' + read_text(text, attrib_filter)
    if tag.text:
        line = line + ' ' + tag.text
    return line + read_tspans(tag) + read_textpaths(tag)


def read_flowspans(tag):
    """Inner helper function for extracting texts from XML flowSpan elements in
    SVG files.

    All flowSpan tags can be nested.

    Keyword arguments:
    tag -- an xml.etree.Element that potentially contains flowSpan Elements
    """

    result = ''
    for flowspan in tag.findall('{http://www.w3.org/2000/svg}flowSpan'):
        if flowspan.text:
            result = result + flowspan.text
        # There can be nested tags
        result = result + read_flowspans(flowspan)
        # And more text after the nested tags
        if flowspan.tail:
            result = result + flowspan.tail
    return result


def read_flowroots(tag, attrib_filter):
    """Root helper function for extracting texts from XML flowRoot elements in
    SVG files.

    All flowRoot tags can be nested.

    Keyword arguments:
    tag --           an xml.etree.Element that potentially contains flowRoot Elements
    attrib_filter -- a dict of {'attribute': re.compile('value')}
    """
    result = []
    for flowroot in tag.findall('{http://www.w3.org/2000/svg}flowRoot'):
        line = ''
        id_found = check_filter(flowroot, attrib_filter)
        for flowpara in flowroot.findall('{http://www.w3.org/2000/svg}flowPara'):
            if not id_found and not check_filter(flowpara, attrib_filter):
                continue
            line = line + ' '
            if flowpara.text:
                line = line + flowpara.text
            # There can be nested tags
            line = line + read_flowspans(flowpara)
            # And more text after the nested tags
            if flowpara.tail:
                line = line + ' ' + flowpara.tail
        line = format_line(line, flowroot.get('id'))
        if line != '':
            result.append(line)
    return result


def read_gs(tag, attrib_filter_inherited):
    """Root helper function for extracting texts from XML g elements in SVG
    files. Most text is below g.

    All g tags can be nested.

    Keyword arguments:
    tag --           an xml.etree.Element that potentially contains g Elements
    attrib_filter -- a dict of {'attribute': re.compile('value')}
    """
    result = []
    for graph in tag.findall('{http://www.w3.org/2000/svg}g'):
        attrib_filter = attrib_filter_inherited
        g_label = graph.attrib.get('{http://www.inkscape.org/namespaces/inkscape}label')
        g_gm = graph.attrib.get('{http://www.inkscape.org/namespaces/inkscape}groupmode')
        if g_label in g_layer_blocklist_labels and g_gm == 'layer':
            print ("Activated layer filter on '" + g_label + "'")
            if len(g_child_allowlist_ids) > 1:
                attrib_filter = {"id" : re.compile('|'.join(g_child_allowlist_ids) )}
            elif len(g_child_allowlist_ids) == 1:
                attrib_filter = {"id" : re.compile(g_child_allowlist_ids)}
            else:
                continue
        result = result + read_flowroots(graph, attrib_filter)
        result = result + read_gs(graph, attrib_filter)
        for text in graph.findall('{http://www.w3.org/2000/svg}text'):
            if not check_filter(text, attrib_filter):
                continue
            line = format_line(read_text(text, attrib_filter), text.get('id'))
            if line != '':
                result.append(line)
    return result


def read_svg(filepath, attrib_filter):
    """Read text elements from an SVG file.

    Optionally, you can filter texts for a list of attribute-value pairs.
    The filter is somewhat primitive and only works with attributes on main-level
    flowroot and text tags.

    Keyword arguments:
    filepath --      the full path to the SVG file,
                     e.g. webcomics/ep01_Potion-of-Flight/lang/fr/E01P00.svg
    attrib_filter -- a dict of {'attribute': re.compile('value')}
    """
    root = xml.etree.ElementTree.parse(filepath).getroot()

    # Root can have direct flowroot text in it
    result = read_flowroots(root, attrib_filter)

    # Most text is in (nested) g tags
    result = result + read_gs(root, attrib_filter)

    return result
