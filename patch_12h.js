import fs from 'fs';

const file = 'public/zomato_store_time/update_advanced_timings.py';
let content = fs.readFileSync(file, 'utf8');

const oldBlock = `                                if len(selects) >= 6:
                                    sh, sm = start.split(":")
                                    eh, em = end.split(":")
                                    # Convert 24hr to 12hr AM/PM for selects
                                    # (Basic implementation assuming standard format)
                                    pass # (Handled by previous scripts if needed)`;

const newBlock = `                                if len(selects) >= 6:
                                    def to_12h(t_str):
                                        h, m = t_str.split(":")
                                        h_int = int(h)
                                        p = "AM" if h_int < 12 else "PM"
                                        h12 = h_int % 12
                                        if h12 == 0: h12 = 12
                                        return f"{h12:02d}", m, p
                                    
                                    o_h, o_m, o_p = to_12h(start)
                                    c_h, c_m, c_p = to_12h(end)
                                    
                                    selects[0].select_option(o_h)
                                    selects[1].select_option(o_m)
                                    selects[2].select_option(o_p)
                                    selects[3].select_option(c_h)
                                    selects[4].select_option(c_m)
                                    selects[5].select_option(c_p)`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(file, content);
console.log("Patched 12hr conversion successfully!");
