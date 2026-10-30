#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
export HOME=/tmp/oc OFFICECLI_RESIDENT_FLUSH=each
mkdir -p $HOME
cd $HOME
id -un
for f in t.docx t.xlsx t.pptx; do officecli create $f >/dev/null; done
officecli add t.docx /body --type paragraph --prop text="中文段落 officecli" >/dev/null
officecli set t.xlsx '/Sheet1/A1' --prop value=21 >/dev/null
officecli set t.xlsx '/Sheet1/A2' --prop formula='A1*2' >/dev/null
officecli add t.pptx / --type slide >/dev/null
for f in t.docx t.xlsx t.pptx; do officecli validate $f >/dev/null && echo "validate-ok $f"; done
officecli view t.docx text | grep -q "中文段落" && echo readback-docx-ok
officecli get t.xlsx '/Sheet1/A2' --json | head -c 300
echo
