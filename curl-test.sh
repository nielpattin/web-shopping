#!/bin/bash

# Testing single character queries

echo "Testing \"p\" query:"
curl -s "http://localhost/search?q=p"
echo
echo
echo "Testing \"a\" query:"
curl -s "http://localhost/search?q=a"
echo
echo
echo "Testing \"phone\" query:"
curl -s "http://localhost/search?q=phone"
echo
echo