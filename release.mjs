import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

async function filesUnder(root, current = root) {
  const result = [];
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(root, full));
    else result.push(path.relative(root, full).replaceAll('\\','/'));
  }
  return result.sort();
}

export async function collectHashes(root) {
  const hashes = {};
  for (const relative of await filesUnder(root)) {
    const bytes = await fs.readFile(path.join(root, relative));
    hashes[relative] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  return hashes;
}

export function compareHashes(source, packaged) {
  const missing = Object.keys(source).filter(file => !(file in packaged));
  const extra = Object.keys(packaged).filter(file => !(file in source));
  const changed = Object.keys(source).filter(file => packaged[file] && packaged[file] !== source[file]);
  return { missing, extra, changed, matches: !missing.length && !extra.length && !changed.length };
}

export async function copyAndVerifyDist(source, target) {
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true });
  const sourceHashes = await collectHashes(source);
  const comparison = compareHashes(sourceHashes, await collectHashes(target));
  if (!comparison.matches) throw new Error(`Packaged dist mismatch: ${JSON.stringify(comparison)}`);
  return sourceHashes;
}

export async function packageRelease() {
  const packageData = JSON.parse(await fs.readFile(path.join(projectRoot,'package.json'),'utf8'));
  const releaseRoot = path.join(projectRoot,'desktop','release');
  const staging = path.join(releaseRoot,`Forma-${packageData.version}`);
  const executable = path.join(projectRoot,'desktop','bin','x64','Release','Forma.exe');
  await fs.access(executable);
  await fs.rm(staging,{recursive:true,force:true});
  await fs.mkdir(staging,{recursive:true});
  const hashes = await copyAndVerifyDist(path.join(projectRoot,'dist'),path.join(staging,'dist'));
  const serverModules = ['server.mjs','server-assets.mjs','server-fonts.mjs','render-service.mjs','workspace-service.mjs'];
  const importModules = (await fs.readdir(projectRoot)).filter(file => /^fig-import(?:-[\w-]+)?\.mjs$/.test(file));
  for (const file of [...serverModules, ...importModules]) {
    await fs.copyFile(path.join(projectRoot,file),path.join(staging,file));
  }
  await fs.mkdir(path.join(staging,'node_modules'),{recursive:true});
  for (const dependency of ['openfig-core','fflate','fzstd','kiwi-schema']) {
    await fs.cp(path.join(projectRoot,'node_modules',dependency),path.join(staging,'node_modules',dependency),{recursive:true});
  }
  await fs.writeFile(path.join(staging,'THIRD-PARTY-NOTICES.txt'),[
    'Forma includes these MIT-licensed packages for offline Figma .fig decoding:',
    '',
    'openfig-core 0.4.1 — Copyright (c) rcoenen — https://github.com/OpenFig-org/openfig-core',
    'fflate 0.8.3 — see node_modules/fflate/LICENSE',
    'fzstd 0.1.1 — see node_modules/fzstd/LICENSE',
    'kiwi-schema 0.5.0 — https://github.com/evanw/kiwi',
    '',
    'Each package is distributed under the MIT License. Copyright and permission notice:',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of the software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to including the copyright and permission notice in copies or substantial portions of the Software.',
  ].join('\n'));
  await fs.copyFile(executable,path.join(staging,'Forma.exe'));
  for (const file of ['WebView2Loader.dll']) {
    try { await fs.copyFile(path.join(projectRoot,'desktop','bin','x64','Release',file),path.join(staging,file)); } catch {}
  }
  await fs.cp(path.join(projectRoot,'desktop','runtime'),path.join(staging,'runtime'),{recursive:true});
  await fs.mkdir(path.join(staging,'GrapesJS','projects'),{recursive:true});
  await fs.mkdir(path.join(staging,'GrapesJS','exports'),{recursive:true});
  const manifest={format:'forma-release-manifest',version:1,appVersion:packageData.version,createdAt:new Date().toISOString(),files:Object.fromEntries(Object.entries(hashes).map(([file,hash])=>[`dist/${file}`,`sha256:${hash}`]))};
  await fs.writeFile(path.join(staging,'release-manifest.json'),JSON.stringify(manifest,null,2));
  const verification=compareHashes(hashes,await collectHashes(path.join(staging,'dist')));
  if(!verification.matches)throw new Error(`Release verification failed: ${JSON.stringify(verification)}`);
  const zip=path.join(releaseRoot,`Forma-Desktop-${packageData.version}.zip`);
  await fs.rm(zip,{force:true});
  const command=`Compress-Archive -Path '${staging.replaceAll("'","''")}\\*' -DestinationPath '${zip.replaceAll("'","''")}' -Force`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',command],{stdio:'inherit'});
  if(result.status!==0)throw new Error('Release ZIP creation failed');
  return {staging,zip,manifest};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageRelease().then(({zip})=>console.log(`Release ready: ${zip}`)).catch(error=>{console.error(error.message);process.exitCode=1;});
}

