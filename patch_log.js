import fs from 'fs';

const file = 'public/zomato_store_time/update_advanced_timings.py';
let content = fs.readFileSync(file, 'utf8');

const oldBlock = `                            if len(inputs) >= 2:
                                inputs[0].fill(start)
                                inputs[1].fill(end)
                            else:
                                selects = day_row.locator("select").all()`;

const newBlock = `                            if len(inputs) >= 2:
                                print(f"Found {len(inputs)} time inputs, filling...")
                                inputs[0].fill(start)
                                inputs[1].fill(end)
                            else:
                                selects = day_row.locator("select").all()
                                print(f"Found {len(selects)} select dropdowns.")`;

content = content.replace(oldBlock, newBlock);

const oldBlock2 = `                                    selects[4].select_option(c_m)
                                    selects[5].select_option(c_p)`;

const newBlock2 = `                                    selects[4].select_option(c_m)
                                    selects[5].select_option(c_p)
                                else:
                                    print("WARNING: Could not find any standard inputs or select dropdowns to fill!")`;

content = content.replace(oldBlock2, newBlock2);

fs.writeFileSync(file, content);
console.log("Patched logging successfully!");
