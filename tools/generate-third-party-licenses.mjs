import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
export const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// Reviewed source snapshots only: generation/checking never fetches or installs.
const supplementalNotices =
[
  {
    "kind": "upstream-license",
    "packages": {
      "@napi-rs/canvas-darwin-arm64@1.0.2": "sha512-Sc8tPi6cF+5lqOzCCKFALJHhDiRwyMzTPYm3bbhdXsOunU0lQO5f05ucyOzN2r55I23Hg5bsjH63uSCvWp3EgQ=="
    },
    "evidence": "npm 精确版本元数据的 gitHead 对应仓库根 LICENSE。",
    "source": "https://raw.githubusercontent.com/Brooooooklyn/canvas/826600b258db693d98a652c935e2b94107b41bb2/LICENSE",
    "sha256": "8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6",
    "text": "MIT License\n\nCopyright (c) 2020 lynweklm@gmail.com\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n"
  },
  {
    "kind": "upstream-license",
    "packages": {
      "css-render@0.15.14": "sha512-9nF4PdUle+5ta4W5SyZdLCCmFd37uVimSjg1evcTqKJCyvCEEj12WKzOSBNak6r4im4J4iYXKH1OWpUV5LBYFg==",
      "@css-render/vue3-ssr@0.15.14": "sha512-//8027GSbxE9n3QlD73xFY6z4ZbHbvrOVB7AO6hsmrEzGbg+h2A09HboUyDgu+xsmj7JnvJD39Irt+2D0+iV8g==",
      "@css-render/plugin-bem@0.15.14": "sha512-QK513CJ7yEQxm/P3EwsI+d+ha8kSOcjGvD6SevM41neEMxdULE+18iuQK6tEChAWMOQNQPLG/Rw3Khb69r5neg=="
    },
    "evidence": "三个 npm 精确版本具有相同 gitHead；采用该提交仓库根 LICENSE。",
    "source": "https://raw.githubusercontent.com/07akioni/css-render/9345145da71707d1d05a99c1d3a6e89315ac0574/LICENSE",
    "sha256": "306f57de421d7ef77f7dc145e1234f9c0ec76b710d28769b4d98ef3c4f8a64bd",
    "text": "MIT License\n\nCopyright (c) 2020 07akioni\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n"
  },
  {
    "kind": "upstream-license",
    "packages": {
      "@earendil-works/pi-ai@0.84.1": "sha512-wMsAdJMxuNri08vLqTyYVI201DQQezGhPSTkzYsHdw5dYX3rCNwEmSvpaAwhi7ELKI/2tE/CEgSWg/6iRxSgdQ==",
      "@earendil-works/pi-agent-core@0.84.1": "sha512-evyzXYWCLQGmcaBYHlmSku02r8qoN4SGI60GZABo6iV+H+nqX+P9ud8fEZ4GmRq9mUSREvvfX+w9dA9ThF9C6w==",
      "@earendil-works/pi-telemetry@0.84.1": "sha512-180/xGJtsq7IoR3p9EKWjRd0e9M4DkxInhlo9xyD7prDC7Qrhqq+nhvwrW0lFjPfXcEI2FSHmGCSyvSJE9GsaQ=="
    },
    "evidence": "三个 npm 精确版本具有相同 gitHead；采用该提交仓库根 LICENSE。",
    "source": "https://raw.githubusercontent.com/earendil-works/pi/53fa77ccd8a279eb87e92294ef3687b03ff80112/LICENSE",
    "sha256": "0457f5bcec3b3b211605dfb5d1a49042fd638f3686a410fe099c24a25af13c48",
    "text": "MIT License\n\nCopyright (c) 2025 Mario Zechner\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE."
  },
  {
    "kind": "upstream-license",
    "packages": {
      "@aws-sdk/nested-clients@3.997.33": "sha512-dVZOroI/r3/ENvqNGgjMPul+jjlz9GddfVusgTXlVjfZj5isibOxecLkGQbRPp8XOuX+RAfjXLFgPkD1JS5xrw==",
      "@aws-sdk/credential-provider-http@3.972.61": "sha512-8jAjgStl5Ytq4+HF3X/9f+EmRinaRbGRRtQGktlPfBRVx73H+R1y48vIeXerQtYGFaUqkEp3fT6jP854rVO2yQ==",
      "@aws-sdk/credential-provider-login@3.972.65": "sha512-xr9rgjYEdmC2Tpg2lwt9o+nOEaK9Qpd+dBjzrVCuWWyQfvhO91Ezu0Hh9ts2VUxOZxmS/k5T9msa34e4R1bnrQ=="
    },
    "evidence": "npm 发布于 2026-07-15；对应 Publish v3.1088.0 提交的 packages-internal/{nested-clients,credential-provider-http,credential-provider-login}/package.json 名称、版本和许可证与发行包一致，采用该提交仓库根 LICENSE；不把缺失 gitHead 猜作已提供。",
    "source": "https://raw.githubusercontent.com/aws/aws-sdk-js-v3/73de389ea58ac4efc26478af2da79dba02c40896/LICENSE",
    "sha256": "edea91454b811f127fbdea3d86f378f6719bd372ed440abf82b232f6fca06c3d",
    "text": "Apache License\n                           Version 2.0, January 2004\n                        http://www.apache.org/licenses/\n\n   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION\n\n   1. Definitions.\n\n      \"License\" shall mean the terms and conditions for use, reproduction,\n      and distribution as defined by Sections 1 through 9 of this document.\n\n      \"Licensor\" shall mean the copyright owner or entity authorized by\n      the copyright owner that is granting the License.\n\n      \"Legal Entity\" shall mean the union of the acting entity and all\n      other entities that control, are controlled by, or are under common\n      control with that entity. For the purposes of this definition,\n      \"control\" means (i) the power, direct or indirect, to cause the\n      direction or management of such entity, whether by contract or\n      otherwise, or (ii) ownership of fifty percent (50%) or more of the\n      outstanding shares, or (iii) beneficial ownership of such entity.\n\n      \"You\" (or \"Your\") shall mean an individual or Legal Entity\n      exercising permissions granted by this License.\n\n      \"Source\" form shall mean the preferred form for making modifications,\n      including but not limited to software source code, documentation\n      source, and configuration files.\n\n      \"Object\" form shall mean any form resulting from mechanical\n      transformation or translation of a Source form, including but\n      not limited to compiled object code, generated documentation,\n      and conversions to other media types.\n\n      \"Work\" shall mean the work of authorship, whether in Source or\n      Object form, made available under the License, as indicated by a\n      copyright notice that is included in or attached to the work\n      (an example is provided in the Appendix below).\n\n      \"Derivative Works\" shall mean any work, whether in Source or Object\n      form, that is based on (or derived from) the Work and for which the\n      editorial revisions, annotations, elaborations, or other modifications\n      represent, as a whole, an original work of authorship. For the purposes\n      of this License, Derivative Works shall not include works that remain\n      separable from, or merely link (or bind by name) to the interfaces of,\n      the Work and Derivative Works thereof.\n\n      \"Contribution\" shall mean any work of authorship, including\n      the original version of the Work and any modifications or additions\n      to that Work or Derivative Works thereof, that is intentionally\n      submitted to Licensor for inclusion in the Work by the copyright owner\n      or by an individual or Legal Entity authorized to submit on behalf of\n      the copyright owner. For the purposes of this definition, \"submitted\"\n      means any form of electronic, verbal, or written communication sent\n      to the Licensor or its representatives, including but not limited to\n      communication on electronic mailing lists, source code control systems,\n      and issue tracking systems that are managed by, or on behalf of, the\n      Licensor for the purpose of discussing and improving the Work, but\n      excluding communication that is conspicuously marked or otherwise\n      designated in writing by the copyright owner as \"Not a Contribution.\"\n\n      \"Contributor\" shall mean Licensor and any individual or Legal Entity\n      on behalf of whom a Contribution has been received by Licensor and\n      subsequently incorporated within the Work.\n\n   2. Grant of Copyright License. Subject to the terms and conditions of\n      this License, each Contributor hereby grants to You a perpetual,\n      worldwide, non-exclusive, no-charge, royalty-free, irrevocable\n      copyright license to reproduce, prepare Derivative Works of,\n      publicly display, publicly perform, sublicense, and distribute the\n      Work and such Derivative Works in Source or Object form.\n\n   3. Grant of Patent License. Subject to the terms and conditions of\n      this License, each Contributor hereby grants to You a perpetual,\n      worldwide, non-exclusive, no-charge, royalty-free, irrevocable\n      (except as stated in this section) patent license to make, have made,\n      use, offer to sell, sell, import, and otherwise transfer the Work,\n      where such license applies only to those patent claims licensable\n      by such Contributor that are necessarily infringed by their\n      Contribution(s) alone or by combination of their Contribution(s)\n      with the Work to which such Contribution(s) was submitted. If You\n      institute patent litigation against any entity (including a\n      cross-claim or counterclaim in a lawsuit) alleging that the Work\n      or a Contribution incorporated within the Work constitutes direct\n      or contributory patent infringement, then any patent licenses\n      granted to You under this License for that Work shall terminate\n      as of the date such litigation is filed.\n\n   4. Redistribution. You may reproduce and distribute copies of the\n      Work or Derivative Works thereof in any medium, with or without\n      modifications, and in Source or Object form, provided that You\n      meet the following conditions:\n\n      (a) You must give any other recipients of the Work or\n          Derivative Works a copy of this License; and\n\n      (b) You must cause any modified files to carry prominent notices\n          stating that You changed the files; and\n\n      (c) You must retain, in the Source form of any Derivative Works\n          that You distribute, all copyright, patent, trademark, and\n          attribution notices from the Source form of the Work,\n          excluding those notices that do not pertain to any part of\n          the Derivative Works; and\n\n      (d) If the Work includes a \"NOTICE\" text file as part of its\n          distribution, then any Derivative Works that You distribute must\n          include a readable copy of the attribution notices contained\n          within such NOTICE file, excluding those notices that do not\n          pertain to any part of the Derivative Works, in at least one\n          of the following places: within a NOTICE text file distributed\n          as part of the Derivative Works; within the Source form or\n          documentation, if provided along with the Derivative Works; or,\n          within a display generated by the Derivative Works, if and\n          wherever such third-party notices normally appear. The contents\n          of the NOTICE file are for informational purposes only and\n          do not modify the License. You may add Your own attribution\n          notices within Derivative Works that You distribute, alongside\n          or as an addendum to the NOTICE text from the Work, provided\n          that such additional attribution notices cannot be construed\n          as modifying the License.\n\n      You may add Your own copyright statement to Your modifications and\n      may provide additional or different license terms and conditions\n      for use, reproduction, or distribution of Your modifications, or\n      for any such Derivative Works as a whole, provided Your use,\n      reproduction, and distribution of the Work otherwise complies with\n      the conditions stated in this License.\n\n   5. Submission of Contributions. Unless You explicitly state otherwise,\n      any Contribution intentionally submitted for inclusion in the Work\n      by You to the Licensor shall be under the terms and conditions of\n      this License, without any additional terms or conditions.\n      Notwithstanding the above, nothing herein shall supersede or modify\n      the terms of any separate license agreement you may have executed\n      with Licensor regarding such Contributions.\n\n   6. Trademarks. This License does not grant permission to use the trade\n      names, trademarks, service marks, or product names of the Licensor,\n      except as required for reasonable and customary use in describing the\n      origin of the Work and reproducing the content of the NOTICE file.\n\n   7. Disclaimer of Warranty. Unless required by applicable law or\n      agreed to in writing, Licensor provides the Work (and each\n      Contributor provides its Contributions) on an \"AS IS\" BASIS,\n      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or\n      implied, including, without limitation, any warranties or conditions\n      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A\n      PARTICULAR PURPOSE. You are solely responsible for determining the\n      appropriateness of using or redistributing the Work and assume any\n      risks associated with Your exercise of permissions under this License.\n\n   8. Limitation of Liability. In no event and under no legal theory,\n      whether in tort (including negligence), contract, or otherwise,\n      unless required by applicable law (such as deliberate and grossly\n      negligent acts) or agreed to in writing, shall any Contributor be\n      liable to You for damages, including any direct, indirect, special,\n      incidental, or consequential damages of any character arising as a\n      result of this License or out of the use or inability to use the\n      Work (including but not limited to damages for loss of goodwill,\n      work stoppage, computer failure or malfunction, or any and all\n      other commercial damages or losses), even if such Contributor\n      has been advised of the possibility of such damages.\n\n   9. Accepting Warranty or Additional Liability. While redistributing\n      the Work or Derivative Works thereof, You may choose to offer,\n      and charge a fee for, acceptance of support, warranty, indemnity,\n      or other liability obligations and/or rights consistent with this\n      License. However, in accepting such obligations, You may act only\n      on Your own behalf and on Your sole responsibility, not on behalf\n      of any other Contributor, and only if You agree to indemnify,\n      defend, and hold each Contributor harmless for any liability\n      incurred by, or claims asserted against, such Contributor by reason\n      of your accepting any such warranty or additional liability.\n\n   END OF TERMS AND CONDITIONS\n\n   APPENDIX: How to apply the Apache License to your work.\n\n      To apply the Apache License to your work, attach the following\n      boilerplate notice, with the fields enclosed by brackets \"[]\"\n      replaced with your own identifying information. (Don't include\n      the brackets!)  The text should be enclosed in the appropriate\n      comment syntax for the file format. We also recommend that a\n      file or class name and description of purpose be included on the\n      same \"printed page\" as the copyright notice for easier\n      identification within third-party archives.\n\n   Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.\n\n   Licensed under the Apache License, Version 2.0 (the \"License\");\n   you may not use this file except in compliance with the License.\n   You may obtain a copy of the License at\n\n       http://www.apache.org/licenses/LICENSE-2.0\n\n   Unless required by applicable law or agreed to in writing, software\n   distributed under the License is distributed on an \"AS IS\" BASIS,\n   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n   See the License for the specific language governing permissions and\n   limitations under the License."
  },
  {
    "kind": "metadata-declaration",
    "packages": {
      "lazy-val@1.0.5": "sha512-0/BnGCCfyUMkBpeDgWihanIAF9JmZhHBgUhEqzvf+adhNGLoP6TaiI5oF8oyb3I45P+PcnrqihSf01M0l0G5+Q==",
      "vdirs@0.1.8": "sha512-H9V1zGRLQZg9b+GdMk8MXDN2Lva0zx72MPahDKc30v+DtwKjfyOSXWRIX4t2mhDubM1H09gPhWeth/BJWPHGUw=="
    },
    "evidence": "声明型许可证证据：已安装 package.json 与 npm 精确版本元数据均声明 MIT，并保留实际作者字段；该 npm 发行包未附 LICENSE 或完整版权 notice。以下是 SPDX 官方 MIT 标准条款，不冒充上游 LICENSE。<year> 和 <copyright holders> 是标准模板占位符，不代表本包的版权年份或权利人；未编造版权信息。",
    "source": "https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/MIT.txt",
    "sha256": "b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5",
    "text": "MIT License\n\nCopyright (c) <year> <copyright holders>\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and\nassociated documentation files (the \"Software\"), to deal in the Software without restriction, including\nwithout limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the\nfollowing conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial\nportions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT\nLIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO\nEVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER\nIN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE\nUSE OR OTHER DEALINGS IN THE SOFTWARE.\n"
  }
];

/** pnpm list is local-only. Ignore unsaved/dev dependencies, but retain peers. */
export function loadProductionPackages(root = workspaceRoot) {
  const graph = JSON.parse(execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "--filter", "@deepwrite/desktop", "--prod", "list", "--depth", "Infinity", "--json"
  ], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30_000 }));
  const packages = new Map();
  const skipped = new Set();
  function visit(parent) {
    const manifest = readJson(join(parent.path, "package.json"));
    for (const [name, dependency] of Object.entries({ ...parent.dependencies, ...parent.optionalDependencies })) {
      const packagePath = dependency.path;
      const rel = packagePath && relative(root, packagePath);
      if (!rel || rel.startsWith(`..${sep}`) || rel === "..") throw new Error(`依赖路径不属于项目：${name}`);
      const manifestPath = join(packagePath, "package.json");
      if (!existsSync(manifestPath)) {
        if (!Object.hasOwn(manifest.optionalDependencies ?? {}, name)) throw new Error(`缺少已锁定依赖：${name}`);
        skipped.add(`${name}@${dependency.version}`);
        continue;
      }
      const pkg = readJson(manifestPath);
      if (rel.startsWith(`node_modules${sep}`)) {
        if (!pkg.name || !pkg.version) throw new Error(`依赖缺少身份字段：${name}`);
        packages.set(`${pkg.name}@${pkg.version}`, { ...pkg, packagePath });
      }
      if (dependency.dependencies || dependency.optionalDependencies) visit(dependency);
    }
  }
  if (graph.length !== 1 || graph[0].name !== "@deepwrite/desktop") throw new Error("无法定位桌面端生产依赖图");
  visit(graph[0]);
  return { packages: [...packages.values()].sort((a, b) => compare(`${a.name}@${a.version}`, `${b.name}@${b.version}`)), skipped: [...skipped].sort(compare) };
}

/** Include nested notices (e.g. PDF.js fonts/WASM); never follow symlinks. */
export function findLicenseFiles(packagePath) {
  const result = [];
  const namePattern = /(?:^|[._-])(?:licen[sc]es?|copying|copyright|notices?)(?:[._-]|$)|^(?:third.?party|copyrightnotice)/i;
  function walk(directory, inLicenseDirectory = false) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (["node_modules", ".git", "test", "tests", "__tests__"].includes(entry.name)) continue;
      const file = join(directory, entry.name);
      const isLicense = namePattern.test(entry.name);
      if (entry.isDirectory()) walk(file, inLicenseDirectory || isLicense);
      else if (entry.isFile() && (isLicense || inLicenseDirectory) && !/\.(?:js|mjs|cjs|map|ts|json|node|wasm|png|jpg)$/i.test(entry.name)) {
        const text = readFileSync(file, "utf8");
        if (text.trim()) result.push({ file: relative(packagePath, file).split(sep).join("/"), text });
      }
    }
  }
  walk(packagePath);
  if (!result.length) {
    for (const name of readdirSync(packagePath).filter((name) => /^readme(?:\.md|\.txt)?$/i.test(name)).sort(compare)) {
      const readme = readFileSync(join(packagePath, name), "utf8");
      const heading = /(?:^|\n)(?:#{1,6} +Licen[sc]e[^\n]*|Licen[sc]e[^\n]*\n[-=]+)\n/i.exec(readme);
      if (!heading) continue;
      const text = readme.slice(heading.index).trim();
      if (/Permission is hereby granted/.test(text) && /COPYRIGHT HOLDERS BE LIABLE/.test(text)) result.push({ file: `${name} (license section)`, text });
    }
  }
  return result;
}

export function lockIntegrity(lock, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^  ['\"]?${escaped}['\"]?:\\r?\\n    resolution: \\{integrity: ([^}]+)\\}`, "m").exec(lock)?.[1];
}

export function licenseRecord(pkg, lock) {
  const id = `${pkg.name}@${pkg.version}`;
  const license = pkg.license;
  const allowed = new Set(["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "BlueOak-1.0.0", "Python-2.0"]);
  if (!allowed.has(license)) throw new Error(`许可证缺失或需要另行审查：${id} (${typeof license === "string" ? license : "未声明"})`);
  if (!lockIntegrity(lock, id)) throw new Error(`依赖身份不在锁文件中：${id}`);
  const files = findLicenseFiles(pkg.packagePath);
  if (files.length) return { id, license, kind: "installed-notice", files };
  const supplemental = supplementalNotices.find((entry) => Object.hasOwn(entry.packages, id));
  if (!supplemental) throw new Error(`缺少许可证原文及已核验声明证据：${id}`);
  if (lockIntegrity(lock, id) !== supplemental.packages[id]) throw new Error(`补充许可与锁文件完整性不匹配：${id}`);
  if (sha256(supplemental.text) !== supplemental.sha256) throw new Error(`补充许可文本校验失败：${id}`);
  if (supplemental.kind === "metadata-declaration" && license !== "MIT") throw new Error(`声明型许可证已变化：${id}`);
  return { id, license, kind: supplemental.kind, author: pkg.author, evidence: supplemental.evidence, files: [{ file: supplemental.source, text: supplemental.text }] };
}

export function assertPublicNotice(text) {
  if (/\/Users\/|\/home\/|[A-Za-z]:\\Users\\|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    throw new Error("许可汇总含本机路径或私钥标识，已阻止输出");
  }
}

export function renderNotices({ version, lockHash, records, skipped, electronVersion, chromiumHash }) {
  const declarations = records.filter((record) => record.kind === "metadata-declaration").map((record) => record.id);
  const lines = [
    "墨枢（InkHub）第三方许可证与版权声明", "",
    `应用版本：${version}`,
    `pnpm-lock.yaml SHA-256：${lockHash}`,
    "生成命令：node tools/generate-third-party-licenses.mjs",
    "只读复验：node tools/generate-third-party-licenses.mjs --check", "",
    "范围：桌面端已安装 production 依赖闭包（包含其依赖和 peer；不读取未保存依赖或直接开发工具）。",
    "采用保守覆盖：即使某个依赖或附带字体/解码器被 tree-shaking 排除，仍保留其许可。",
    "工作区自身代码及上游基础许可另见随包 LICENSE、NOTICE、UPSTREAM.md 和 THIRD_PARTY_NOTICES.md。",
    "本文件不包含用户小说、模型凭据、本机路径或安装环境配置。", "",
    `许可记录：${records.length}（含 Electron ${electronVersion}）`,
    `声明型证据：${declarations.length ? declarations.join("、") : "无"}`,
    "声明型证据保留包的明确 SPDX 许可声明及实际作者元数据，并附官方标准条款；",
    "它与上游附带的 LICENSE 原文是不同的证据类型，不补写版权年份，也不代表法律保证。", "",
    `未安装、未纳入的可选平台包：${skipped.length ? skipped.join("、") : "无"}`, "",
    "Electron/Chromium/Node.js 等嵌入组件的第三方声明另见随包原文 LICENSES.chromium.html。",
    `LICENSES.chromium.html SHA-256：${chromiumHash}`,
    "Electron 自身许可另以 LICENSE.electron.txt 保留；不得省略这两份伴随文件。", ""
  ];
  for (const record of records) {
    lines.push("=".repeat(78), record.id, `声明许可证：${record.license}`, `证据类型：${record.kind}`);
    if (record.author) lines.push(`package.json 作者字段：${JSON.stringify(record.author)}`);
    if (record.evidence) lines.push(record.evidence);
    for (const file of record.files) {
      lines.push("", `许可来源：${file.file}`, `原文 SHA-256：${sha256(file.text)}`, "-".repeat(78), file.text.trimEnd(), "");
    }
  }
  const text = `${lines.join("\n").trimEnd()}\n`;
  assertPublicNotice(text);
  return text;
}

export function generateThirdPartyLicenses(root = workspaceRoot) {
  const { packages, skipped } = loadProductionPackages(root);
  const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  const records = packages.map((pkg) => licenseRecord(pkg, lock));
  const electronPath = join(root, "node_modules/electron");
  const electron = readJson(join(electronPath, "package.json"));
  if (!lockIntegrity(lock, `${electron.name}@${electron.version}`)) throw new Error("Electron 版本与锁文件不匹配");
  records.push({ id: `electron@${electron.version}`, license: electron.license, kind: "installed-runtime-notice", files: [{ file: "electron/dist/LICENSE", text: readFileSync(join(electronPath, "dist/LICENSE"), "utf8") }] });
  records.sort((left, right) => compare(left.id, right.id));
  const text = renderNotices({ version: readJson(join(root, "apps/desktop/package.json")).version, lockHash: sha256(lock), records, skipped, electronVersion: electron.version, chromiumHash: sha256(readFileSync(join(electronPath, "dist/LICENSES.chromium.html"))) });
  return { text, records, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = process.argv.slice(2);
    if (flags.some((flag) => flag !== "--check") || flags.length > 1) throw new Error("用法：node tools/generate-third-party-licenses.mjs [--check]");
    const { text, records, skipped } = generateThirdPartyLicenses();
    const target = join(workspaceRoot, "THIRD_PARTY_LICENSES.txt");
    if (flags.includes("--check")) {
      if (!existsSync(target) || readFileSync(target, "utf8") !== text) throw new Error("第三方许可汇总缺失或已过期；请重新生成后审查");
    } else {
      writeFileSync(target, text, { encoding: "utf8", mode: 0o644 });
    }
    console.log(JSON.stringify({ status: "PASS", mode: flags.includes("--check") ? "check" : "generate", records: records.length, declarationEvidence: records.filter((record) => record.kind === "metadata-declaration").map((record) => record.id), excludedOptional: skipped.length, bytes: Buffer.byteLength(text), sha256: sha256(text) }));
  } catch (error) {
    // Do not echo child-process stderr or filesystem errors containing local paths.
    const message = error instanceof Error ? error.message.split("\n")[0] : "第三方许可生成失败";
    console.error(message.includes(workspaceRoot) ? "第三方许可生成失败；请检查本地依赖与只读访问权限" : message);
    process.exitCode = 1;
  }
}
