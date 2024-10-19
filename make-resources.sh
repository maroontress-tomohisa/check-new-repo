#!/bin/sh
set -eux

print_package_version() {
    node -p "require('./node_modules/$1/package.json').version"
}

print_id_and_version() {
    id=$1
    version=`print_package_version $id`
    echo "    ['$id', '$version'],"
}

prints_versions_js() {
    name=`node -p "require('./package.json').name"`
    version=`node -p "require('./package.json').version"`
    echo 'export const versions = new Map(['
    echo "    ['$name', '$version'],"
    for id in $@; do
        print_id_and_version $id
    done
    echo ']);'
}

prints_versions_js > versions.js
