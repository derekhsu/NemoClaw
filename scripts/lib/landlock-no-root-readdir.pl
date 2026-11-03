#!/usr/bin/perl
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Minimal outer Landlock sandbox: everything stays readable EXCEPT listing "/" itself.
# It reproduces the one OpenShell filesystem-policy property that breaks Homebrew 7's
# own Linux sandbox (Homebrew/brew#24446) without needing an OpenShell gateway.
# Handles LANDLOCK_ACCESS_FS_READ_DIR (and REFER, so links still work) and allows
# both beneath every top-level entry of "/", so opendir("/") is the single denied operation.
# Usage: perl landlock-no-root-readdir.pl <command> [args...]
use strict;
use warnings;

my %nr = (
    x86_64  => { prctl => 157, create => 444, add => 445, restrict => 446 },
    aarch64 => { prctl => 167, create => 444, add => 445, restrict => 446 },
);
chomp(my $arch = `uname -m`);
my $n = $nr{$arch} or die "unsupported arch $arch\n";

my $READ_DIR   = 1 << 3;    # LANDLOCK_ACCESS_FS_READ_DIR
my $REFER      = 1 << 13;   # LANDLOCK_ACCESS_FS_REFER (ABI 2+): keep cross-directory links/renames working
my $HANDLED    = $READ_DIR | $REFER;
my $O_PATH     = 0x200000;
my $O_CLOEXEC  = 0x80000;

my $ruleset_attr = pack("Q", $HANDLED);
my $ruleset = syscall($n->{create}, $ruleset_attr, length($ruleset_attr), 0);
die "landlock_create_ruleset: $!\n" if $ruleset < 0;

opendir(my $root, "/") or die "opendir /: $!\n";
for my $entry (grep { $_ ne "." && $_ ne ".." } readdir($root)) {
    my $path = "/$entry";
    next if -l $path || !-d $path;
    sysopen(my $fh, $path, $O_PATH | $O_CLOEXEC) or next;
    my $beneath = pack("Ql", $HANDLED, fileno($fh));    # packed landlock_path_beneath_attr
    syscall($n->{add}, $ruleset, 1, $beneath, 0) == 0 or die "landlock_add_rule $path: $!\n";
    close($fh);
}
closedir($root);

syscall($n->{prctl}, 38, 1, 0, 0, 0) == 0 or die "prctl(NO_NEW_PRIVS): $!\n";
syscall($n->{restrict}, $ruleset, 0) == 0 or die "landlock_restrict_self: $!\n";
exec { $ARGV[0] } @ARGV or die "exec $ARGV[0]: $!\n";
