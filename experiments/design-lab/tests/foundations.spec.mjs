import {test,expect} from "@playwright/test";
for(const foundation of ["base","aria","ariakit","ark","radix","headless"]){
  test(foundation+" — common workflow, keyboard and responsive evidence",async({page},info)=>{
    await page.goto("/");
    await page.getByLabel("Foundation").selectOption(foundation);
    await expect(page.locator("[data-foundation="+foundation+"]")).toBeVisible();
    await page.getByRole("button",{name:"Students",exact:true}).click();
    const picker=page.getByRole("combobox",{name:"Search students or aliases"});
    await picker.fill("Maya");
    await expect(page.getByRole("option",{name:/Maya Sample/})).toBeVisible();
    await picker.press("ArrowDown");
    await picker.press("Enter");
    await expect(page.getByRole("heading",{name:/Student timeline: Maya Sample/})).toBeVisible();
    await page.getByRole("button",{name:"Today",exact:true}).click();
    await page.getByRole("button",{name:/Endgame group/}).click();
    await page.getByRole("textbox",{name:"Objective"}).fill("");
    await page.getByRole("button",{name:"Save local preview"}).click();
    await expect(page.getByText("Enter a lesson objective")).toBeVisible();
    await page.getByRole("textbox",{name:"Objective"}).fill("Lucena");
    const checkbox=page.getByRole("checkbox",{name:/Daniel Example/});
    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).not.toBeChecked();
    await page.getByRole("textbox",{name:"Private coach note"}).fill("Private observation");
    await page.getByRole("textbox",{name:"Shareable draft (not sent)"}).fill("Shared summary");
    await page.getByRole("button",{name:"Save local preview"}).click();
    await expect(page.getByRole("status")).toContainText("1/2");
    await page.screenshot({path:info.outputPath("lesson-dark.png"),fullPage:true});
    await page.getByRole("button",{name:/Search workspace/}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialog=page.getByRole("dialog");
    const commandPicker=dialog.getByRole("combobox");
    await commandPicker.focus();
    await expect(commandPicker).toBeFocused();
    // If an inner combobox is open, Escape closes it first. A closed picker must allow dialog dismissal.
    if(foundation!=="radix"&&await commandPicker.getAttribute("aria-expanded")==="true"){await page.keyboard.press("Escape");await expect(commandPicker).toHaveAttribute("aria-expanded","false");}
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button",{name:/Workplace:/}).click();
    await page.getByRole("menuitem",{name:"Private"}).click();
    await page.getByRole("button",{name:"Today",exact:true}).click();
    await expect(page.getByRole("button",{name:/Endgame group/})).toHaveCount(0);
    await page.getByLabel("Palette",{exact:true}).selectOption({label:"Storm & Cornflower"});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue("--accent"))).toBe("#92B6EA");
    await page.getByLabel("Palette",{exact:true}).selectOption({label:"Graphite & Iris"});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue("--accent"))).toBe("#B3A9E8");
    await page.getByLabel("Theme").selectOption("light");
    await page.getByLabel("Layout").selectOption("hybrid");
    await page.getByLabel("Language").selectOption("he");
    await page.setViewportSize({width:390,height:844});
    await expect(page.locator("html")).toHaveAttribute("dir","rtl");
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath("mobile-rtl-light.png"),fullPage:true});
  });
}

test("focused direction: brand sizes and layout/density controls",async({page},info)=>{
  await page.goto("/");
  await expect(page.getByLabel("Foundation")).toHaveValue("ark");
  await expect(page.getByLabel("Palette",{exact:true})).toHaveValue("9");
  await expect(page.locator("[data-foundation=ark]")).toBeVisible();
  await page.getByRole("button",{name:"Brand comparison"}).click();
  await expect(page.locator(".brand-study img")).toHaveCount(50);
  await expect.poll(()=>page.locator(".brand-study img").evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  await page.screenshot({path:info.outputPath("brand-sizes.png"),fullPage:true});
  await page.getByLabel("Logo",{exact:true}).selectOption("palette");
  await page.getByRole("button",{name:"Use Mentor & pupil",exact:true}).click();
  await expect(page.getByLabel("Logo",{exact:true})).toHaveValue("mentor");
  await page.getByLabel("Theme").selectOption("light");
  await expect.poll(()=>page.locator(".brand-study img").evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  await page.screenshot({path:info.outputPath("brand-sizes-light.png"),fullPage:true});
  await page.getByLabel("Theme").selectOption("dark");
  await page.getByRole("button",{name:"Brand comparison"}).click();
  for(const layout of ["compact","editorial","hybrid"]){
    await page.getByLabel("Layout").selectOption(layout);
    await page.getByLabel("Density").selectOption("compact");
    await expect(page.locator("main")).toHaveAttribute("data-layout",layout);
    await expect(page.locator("main")).toHaveAttribute("data-density","compact");
    await page.screenshot({path:info.outputPath(layout+"-dark.png"),fullPage:true});
  }
});

test("three secondary brand colors switch in both themes",async({page},info)=>{await page.goto("/");for(const [name,dark,light] of [["Graphite, Iris & Champagne","#CDB58D","#76572E"],["Graphite, Iris & Eucalyptus","#8DB8AC","#35685A"],["Obsidian, Orchid & Ivory","#D7C4AA","#765B3E"]]){await page.getByLabel("Palette",{exact:true}).selectOption({label:name});for(const [theme,expected] of [["dark",dark],["light",light]]){await page.getByLabel("Theme").selectOption(theme);await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue("--secondary"))).toBe(expected);await page.screenshot({path:info.outputPath(name.replace(/[^a-z]+/gi,"-")+"-"+theme+".png"),fullPage:true});}}});

test("selected Ark workflow preserves lesson drafts and cross-workplace history",async({page},info)=>{
 await page.goto("/");await expect(page.locator("[data-foundation=ark]")).toBeVisible();
 await page.getByLabel("Layout").selectOption("hybrid");await page.getByLabel("Typography").selectOption("editorial");
 await expect(page.locator("main")).toHaveAttribute("data-typography","editorial");
 await page.getByRole("button",{name:/Endgame group/}).click();await page.getByRole("textbox",{name:"Private coach note"}).fill("First lesson private draft");await page.getByRole("textbox",{name:"Next lesson focus"}).fill("Repeat Lucena");
 await page.getByRole("button",{name:/Select lesson:/}).click();await page.getByRole("menuitem",{name:/Private lesson/}).click();await page.getByRole("textbox",{name:"Private coach note"}).fill("Second lesson draft");
 await page.getByRole("button",{name:/Select lesson:/}).click();await page.getByRole("menuitem",{name:/Endgame group/}).click();await expect(page.getByRole("textbox",{name:"Private coach note"})).toHaveValue("First lesson private draft");await expect(page.getByRole("textbox",{name:"Next lesson focus"})).toHaveValue("Repeat Lucena");
 await page.screenshot({path:info.outputPath("hybrid-lesson.png"),fullPage:true});
 await page.getByRole("button",{name:/Workplace:/}).click();await page.getByRole("menuitem",{name:"Private",exact:true}).click();await page.getByRole("button",{name:"Students",exact:true}).click();await page.getByRole("button",{name:/Daniel Example/}).click();await expect(page.getByRole("region",{name:"Student profile"})).toContainText("Club · Private");await expect(page.getByRole("region",{name:"Student profile"})).toContainText("Chess.com 1480");
 await page.screenshot({path:info.outputPath("hybrid-students.png"),fullPage:true});
 await page.getByRole("button",{name:"Today",exact:true}).click();await page.getByRole("button",{name:"Reviewed",exact:true}).click();await expect(page.getByRole("button",{name:"Reopen",exact:true})).toBeVisible();
 await page.getByLabel("Language").selectOption("ru");await expect(page.locator("html")).toHaveAttribute("lang","ru");await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:info.outputPath("mobile-ru-hybrid.png"),fullPage:true});
});

test("selected logo pair has grounded pawn feet in both themes",async({page},info)=>{
 await page.goto("/");await expect(page.getByLabel("Logo",{exact:true})).toHaveValue("mentor");
 for(const theme of ["dark","light"]){await page.getByLabel("Theme").selectOption(theme);for(const variant of ["mentor","compact"]){await page.getByLabel("Logo",{exact:true}).selectOption(variant);const mark=page.locator(".sidebar .brand img");await expect.poll(()=>mark.evaluate(img=>{const svg=new DOMParser().parseFromString(decodeURIComponent(img.src.split(",")[1]),"image/svg+xml");const foot=svg.querySelector('[data-part="pawn-foot"]');const book=svg.querySelector('[data-part="book"]');const knight=svg.querySelector('[data-part="knight"]');return !!foot&&!!book&&!!knight&&foot.getAttribute("d").includes("C851 774 792 785 727 818")&&foot.getAttribute("transform")==="translate(0 30)"&&book.getAttribute("d").includes("C792 815 851 804 935 827")&&!!(book.compareDocumentPosition(foot)&Node.DOCUMENT_POSITION_FOLLOWING)&&img.complete&&img.naturalWidth>0;})).toBe(true);}}
 await page.getByRole("button",{name:"Brand comparison"}).click();await page.screenshot({path:info.outputPath("grounded-logo-family-light.png"),fullPage:true});await page.getByLabel("Theme").selectOption("dark");await page.screenshot({path:info.outputPath("grounded-logo-family-dark.png"),fullPage:true});
});

test("optical sizes preserve approved vector paths and wordmark and light treatments switch",async({page},info)=>{
 await page.goto("/");await expect(page.locator("[data-foundation=ark]")).toBeVisible();
 const mark=page.locator(".sidebar .brand img");const results=[];
 for(const variant of ["compact","compact-large","compact-max"]){await page.getByLabel("Logo",{exact:true}).selectOption(variant);const result=await mark.evaluate(img=>{const svg=new DOMParser().parseFromString(decodeURIComponent(img.src.split(",")[1]),"image/svg+xml");return {box:svg.documentElement.getAttribute("viewBox"),knight:svg.querySelector('[data-part="knight"]').getAttribute("d"),pawn:svg.querySelector('[data-part="pawn"]').innerHTML,book:svg.querySelector('[data-part="book"]').getAttribute("d")};});results.push(result);}
 expect(new Set(results.map(r=>r.box)).size).toBe(3);expect(new Set(results.map(r=>r.knight)).size).toBe(1);expect(new Set(results.map(r=>r.pawn)).size).toBe(1);expect(new Set(results.map(r=>r.book)).size).toBe(1);
 await page.getByLabel("Pal color").selectOption("champagne");await expect(page.locator(".sidebar .wordmark")).toHaveAttribute("data-emphasis","champagne");await expect(page.locator(".sidebar .wordmark span")).toHaveText("Pal");
 await page.getByLabel("Theme").selectOption("light");await page.getByLabel("Light logo").selectOption("black");await expect.poll(()=>mark.evaluate(img=>new DOMParser().parseFromString(decodeURIComponent(img.src.split(",")[1]),"image/svg+xml").querySelector('[data-part="knight"]').getAttribute("fill"))).toBe("#1C1D23");
 await page.getByLabel("Light logo").selectOption("outline");await expect.poll(()=>mark.evaluate(img=>new DOMParser().parseFromString(decodeURIComponent(img.src.split(",")[1]),"image/svg+xml").querySelector('[data-part="knight"]').getAttribute("stroke"))).toBe("#292638");
 await page.getByRole("button",{name:"Brand comparison"}).click();await expect(page.locator(".optical-study tbody img")).toHaveCount(15);await page.screenshot({path:info.outputPath("optical-and-light-studies.png"),fullPage:true});
});
