#!/usr/bin/env python3
# encoding: utf-8
#
#  validate_json.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2020 GunChleoc <fios@foramnagaidhlig.net>
#

"""Checks whether all JSON files will parse.

For files where we have templates defined, also performs checks on keys
and values.
"""

from enum import Enum, auto
from pathlib import Path
import codecs
import json
import os.path
import sys
import re


class Checks(Enum):
    """For configuring the checks to run on a JSON object."""
    KEYS_KNOWN = auto()
    KEYS_COMPLETE = auto()
    VALUE_TYPES = auto()


def check_types(key, template, json_object, filename):
    """Checks that the data types match.

    Returns 1 on error, 0 if the check passed.
    """

    if key in template:
        reference_value = template[key]
        value = json_object[key]
        if not isinstance(reference_value, type(value)):
            print('Error in file %s:' % filename)
            print("\t Wrong data type for '%s': Expected %s but got %s" % (
                key, str(type(reference_value)), str(type(value))))
            return 1
    return 0


def check_key_known(key, template, filename):
    """Checks that the given key is present in the given template.

    Returns 1 on error, 0 if the check passed.
    """

    if not key in template:
        print('Error in file %s:' % filename)
        print("\t Unknown key '%s'" % key)
        return 1
    return 0


def check_key_exists(key, json_object, filename):
    """Checkes whether the given mandatory key is present in the json_object.

    Returns 1 on error, 0 if the check passed.
    """

    if not key in json_object:
        print('Error in file %s:' % filename)
        print("\t Missing mandatory key '%s'" % key)
        return 1
    return 0


def check_items(mandatory_template, complete_template, json_object, filename, checks):
    """Runs the given checks on the json_object, using templates as reference.

    The filename is used for error output. Returns the number of errors
    found.
    """

    errors = 0
    # Check that keys & their values are legal
    for key in json_object:
        if Checks.VALUE_TYPES in checks:
            errors = errors + \
                check_types(key, complete_template, json_object, filename)

        if Checks.KEYS_KNOWN in checks:
            errors = errors + check_key_known(key, complete_template, filename)

        # Iterate JSON objects and arrays and check sub-keys
        value = json_object[key]
        if isinstance(value, dict):
            # We have a JSON object, check its keys
            if key in complete_template:
                # Ensure we don't crash if the key is not mandatory
                mandatory_subtemplate = dict()
                if key in mandatory_template:
                    mandatory_subtemplate = mandatory_template[key]
                errors = errors + \
                    check_items(mandatory_subtemplate,
                                complete_template[key],
                                json_object[key],
                                filename,
                                checks)

        elif isinstance(value, list):
            # We have a JSON array
            if key in complete_template:
                complete_list = complete_template[key]
                # Only check JSON array members if they are JSON objects
                if complete_list and isinstance(complete_list[0], dict):
                    # Get expected keys from first reference object in JSON array
                    complete_subtemplate = complete_list[0]
                    # Ensure we don't crash if the key is not mandatory
                    mandatory_subtemplate = dict()
                    if key in mandatory_template:
                        mandatory_list = mandatory_template[key]
                        if mandatory_list and isinstance(mandatory_list[0], dict):
                            mandatory_subtemplate = mandatory_list[0]
                    # Now check all JSON array members
                    for item in json_object[key]:
                        errors = errors + \
                            check_items(mandatory_subtemplate,
                                        complete_subtemplate,
                                        item,
                                        filename,
                                        checks)

    # Check we're not missing any keys
    if Checks.KEYS_COMPLETE in checks:
        # Ensure we have a dict in case of type mismatch
        if isinstance(mandatory_template, dict):
            for key in mandatory_template:
                errors = errors + check_key_exists(key, json_object, filename)
    return errors


def detect_duplicate_keys(ordered_pairs):
    """Use as object_pairs_hook when loading JSON to detect duplicate keys."""
    result = {}
    for key, value in ordered_pairs:
        if key in result:
            raise ValueError('Duplicate key: ' + key)
        result[key] = value
    return result


def load_template(base_path, filename):
    """Load a template file and print error output.

    Returns empty object on failure.
    """
    result = {}
    try:
        jsonfile = codecs.open(os.path.join(base_path, os.path.join(
            '.ci', filename)), encoding='utf-8', mode='r')
        result = json.load(jsonfile, object_pairs_hook=detect_duplicate_keys)
    except json.decoder.JSONDecodeError as error:
        print('Invalid JSON in template .ci/%s:' % filename)
        print('\t', error)
    except ValueError as error:
        print('Error in template .ci/%s:' % filename)
        print('\t', error)
    jsonfile.close()
    return result


def main():
    """Checks whether all JSON files will parse.

    For files where we have templates defined, also performs checks on
    keys and values.
    """

    # Get base path
    base_path = os.path.abspath(os.path.join(
        os.path.dirname(__file__), os.path.pardir))

    # For pretty-printing path in error messages
    path_prefix_length = len(base_path) + 1

    print('##############################################################')
    print('Validating JSON in: %s ' % base_path)

    errors = 0

    # Fetch template for mandatory episode keys
    mandatory_info_template = load_template(
        base_path, 'template_info_mandatory.json')
    if not mandatory_info_template:
        errors = errors + 1

    # Fetch template for all episode keys
    complete_info_template = load_template(base_path, 'template_info.json')
    if not complete_info_template:
        errors = errors + 1

    # Fetch template for mandatory lang info keys
    mandatory_lang_info_template = load_template(
        base_path, 'template_lang_info_mandatory.json')
    if not mandatory_lang_info_template:
        errors = errors + 1

    # Fetch template for all lang info keys
    complete_lang_info_template = load_template(
        base_path, 'template_lang_info.json')
    if not complete_lang_info_template:
        errors = errors + 1

    # Fetch template for mandatory langs keys
    mandatory_langs_template = load_template(
        base_path, 'template_langs_mandatory.json')
    if not mandatory_langs_template:
        errors = errors + 1

    # Fetch template for all langs keys
    complete_langs_template = load_template(base_path, 'template_langs.json')
    if not complete_langs_template:
        errors = errors + 1

    # Check that templates match
    errors = errors + check_items(mandatory_info_template,
                                  mandatory_info_template,
                                  complete_info_template,
                                  'template_info.json compared to '
                                  'template_info_mandatory.json',
                                  [Checks.KEYS_COMPLETE, Checks.VALUE_TYPES])

    errors = errors + check_items(mandatory_lang_info_template,
                                  mandatory_lang_info_template,
                                  complete_lang_info_template,
                                  'template_lang_info.json compared to '
                                  'template_lang_info_mandatory.json',
                                  [Checks.KEYS_COMPLETE, Checks.VALUE_TYPES])

    errors = errors + check_items(mandatory_langs_template,
                                  mandatory_langs_template,
                                  complete_langs_template,
                                  'template_langs.json compared to '
                                  'template_langs_mandatory.json',
                                  [Checks.KEYS_COMPLETE, Checks.VALUE_TYPES])

    if errors > 0:
        print('Found %d error(s) in templates.' % errors)
        print('##############################################################')
        return 1

    # Universal format for MFT files because they are sorted by parent_dir along with info.json
    mft_file_re = re.compile(r'\.?\d+(_info)?\.json')

    # Walk directory with all checks
    checks = list(Checks)
    for (dirpath, _, filenames) in os.walk(base_path):
        for filename in filenames:
            if filename.endswith('.json'):
                jsonpath = os.path.join(dirpath, filename)
                try:
                    jsonfile = codecs.open(
                        jsonpath, encoding='utf-8', mode='r')
                    # Ensure that the JSON will parse for all files
                    json_object = json.load(
                        jsonfile, object_pairs_hook=detect_duplicate_keys)

                    # We have tempates for 'info.json' files to check keys and value types against
                    if filename == 'info.json' or mft_file_re.fullmatch(filename):
                        if os.path.basename(Path(dirpath).parent.as_posix()) == 'lang':
                            # Check lang info
                            errors = errors + \
                                check_items(mandatory_lang_info_template,
                                            complete_lang_info_template,
                                            json_object,
                                            jsonpath[path_prefix_length:],
                                            checks)
                        else:
                            # Check episode info
                            errors = errors + \
                                check_items(mandatory_info_template,
                                            complete_info_template,
                                            json_object,
                                            jsonpath[path_prefix_length:],
                                            checks)
                    elif filename == 'langs.json':
                        # Check langs info
                        for key in json_object:
                            errors = errors + \
                                check_items(mandatory_langs_template,
                                            complete_langs_template,
                                            json_object[key],
                                            jsonpath[path_prefix_length:] +
                                            ' for locale ' + key,
                                            checks)

                except json.decoder.JSONDecodeError as error:
                    print('Invalid JSON in file %s:' %
                          jsonpath[path_prefix_length:])
                    print('\t', error)
                    errors = errors + 1
                except ValueError as error:
                    print('Error in file %s:' % jsonpath[path_prefix_length:])
                    print('\t', error)
                    errors = errors + 1
                jsonfile.close()

    if errors > 0:
        print('Found %d error(s).' % errors)
        print('##############################################################')
        return 1

    print('Done.')
    print('##############################################################')
    return 0


# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main())
