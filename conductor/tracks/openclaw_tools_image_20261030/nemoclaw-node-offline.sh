#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
export HOME=/tmp/home
mkdir -p $HOME
cd /store/node-doc && node -e '
const {Document,Packer,Paragraph}=require("docx");const P=require("pptxgenjs");const sharp=require("sharp");require("react");require("react-dom/server");require("react-icons/fa");
(async()=>{const b=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph("中文 ok")]}]}));
const p=new P();p.addSlide().addText("hi",{x:1,y:1});const pb=await p.write({outputType:"nodebuffer"});
const png=await sharp({create:{width:4,height:4,channels:3,background:"#f00"}}).png().toBuffer();
console.log("node-doc-ok docx",b.length,"pptx",pb.length,"png",png.length,sharp.versions.vips)})()'
rm -rf /tmp/app && cp -R /in/frontend-template /tmp/app && cd /tmp/app
/store/pnpm/bin/pnpm install --offline --frozen-lockfile --store-dir /store/pnpm-store --cache-dir /store/pnpm-cache 2>&1 | tail -4
/store/pnpm/bin/pnpm run build 2>&1 | tail -3
sed -i "/favicon.svg/d" index.html
node -e 'const f="tsconfig.json",fs=require("fs"),c=JSON.parse(fs.readFileSync(f));c.compilerOptions={baseUrl:".",paths:{"@/*":["./src/*"]}};fs.writeFileSync(f,JSON.stringify(c,null,2))'
printf 'export default function App(){return <h1>中文 parcel ok</h1>}\n' >src/App.tsx
printf '{"extends":"@parcel/config-default","resolvers":["parcel-resolver-tspaths","..."]}\n' >.parcelrc
/store/pnpm/bin/pnpm exec parcel build index.html --dist-dir pdist --no-source-maps --no-cache 2>&1 | tail -3
/store/pnpm/bin/pnpm exec html-inline pdist/index.html >bundle.html && grep -c "<script" bundle.html && ls -la bundle.html && echo frontend-offline-ok
