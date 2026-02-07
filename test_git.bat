@echo off
echo Testing Git... > git_test_out.txt
git --version >> git_test_out.txt 2>&1
git remote -v >> git_test_out.txt 2>&1
echo Done. >> git_test_out.txt
