import Handlebars from "handlebars";
import fs from "fs-extra";
import got from "got";
import makeDir from "make-dir";
import path from "path";
import packageJson from "../../package.json";
import promisePipe from "promisepipe";
import tar from "tar";

import { isUrlOk } from "./networking";
import { throwFrameworkNotFoundError, throwTemplateNotFoundError } from "./errors";

const standardFiles: string[] = [
  "package.json",
  "packages/contracts/package.json",
  "packages/contracts/README.md",
  "packages/contracts/src/index.js",
  "packages/react-app/package.json",
  "packages/react-app/README.md",
  "packages/react-app/src/index.js",
  "packages/react-app/src/App.js",
];

const bespokeFiles: { [framework: string]: { [template: string]: string[] } } = {
  react: {
    compound: [
      "packages/contracts/src/abis.js",
      "packages/contracts/src/addresses.js",
      "packages/contracts/src/abis/base0bps_Slope2000bps.json",
      "packages/contracts/src/abis/base200bps_Slope222bps_Kink90_Jump10.json",
      "packages/contracts/src/abis/base200bps_Slope3000bps.json",
      "packages/contracts/src/abis/base500bps_Slope1200bps.json",
      "packages/contracts/src/abis/cBAT.json",
      "packages/contracts/src/abis/cDAI.json",
      "packages/contracts/src/abis/cETH.json",
      "packages/contracts/src/abis/COMP.json",
      "packages/contracts/src/abis/comptroller.json",
      "packages/contracts/src/abis/cREP.json",
      "packages/contracts/src/abis/cSAI.json",
      "packages/contracts/src/abis/cTBTC.json",
      "packages/contracts/src/abis/cUSDC.json",
      "packages/contracts/src/abis/cWBTC.json",
      "packages/contracts/src/abis/cZRX.json",
      "packages/contracts/src/abis/daiRateModel.json",
      "packages/contracts/src/abis/governance.json",
      "packages/contracts/src/abis/priceOracle.json",
      "packages/contracts/src/abis/timelock.json",
    ],
  },
};

export function downloadAndExtractTemplate(root: string, framework: string, name: string): Promise<void> {
  return promisePipe(
    got.stream(`https://codeload.github.com/${packageJson.repository.name}/tar.gz/refactor-templating-system`),
    tar.extract({ cwd: root, strip: 4 }, [`create-eth-app-refactor-templating-system/templates/${framework}/${name}`]),
  );
}

export function hasTemplate(framework: string, name: string): Promise<boolean> {
  return isUrlOk(
    `https://api.github.com/repos/${packageJson.repository.name}/contents/templates/${framework}/${encodeURIComponent(
      name,
    )}?ref=refactor-templating-system`,
  );
}

export async function parseTemplate(appPath: string, framework: string, template: string): Promise<void> {
  if (!bespokeFiles[framework]) {
    throwFrameworkNotFoundError(framework);
  }

  if (!bespokeFiles[framework][template]) {
    throwTemplateNotFoundError(template);
  }

  /* Download the context of the current template */
  const templateContextPath: string = path.join(appPath, "context");
  await makeDir(templateContextPath);
  await downloadAndExtractTemplate(templateContextPath, framework, template);

  for (const standardFile of standardFiles) {
    const contextFileName: string = standardFile + ".context";
    const contextFilePath: string = path.join(templateContextPath, contextFileName);
    const context: JSON = JSON.parse(await fs.readFile(contextFilePath, "utf-8"));

    const hbsFileName: string = standardFile + ".hbs";
    const hbsFilePath: string = path.join(appPath, hbsFileName);
    const hbs: string = await fs.readFile(hbsFilePath, "utf-8");
    const contents: string = Handlebars.compile(hbs)(context);

    const appFilePath: string = path.join(appPath, standardFile);
    await fs.writeFile(appFilePath, contents);
    await fs.remove(hbsFilePath);
  }

  for (const bespokeFile of bespokeFiles[framework][template]) {
    const contextFilePath: string = path.join(templateContextPath, bespokeFile);
    const appFilePath: string = path.join(appPath, bespokeFile);
    await fs.move(contextFilePath, appFilePath);
  }

  /* After all parsing is complete, prune the context of the current template */
  await fs.remove(templateContextPath);
}

export function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper("raw-helper", function(options) {
    return options.fn();
  });
}
