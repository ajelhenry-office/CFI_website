import swiggyLogo from "../../assets/platforms/swiggy.png";
import zomatoLogo from "../../assets/platforms/zomato.png";
import ownlyLogo from "../../assets/platforms/ownly.png";
import flipkartLogo from "../../assets/platforms/flipkart.png";

// Brand workspaces for the Timing tab. Only EatFit has stores loaded so far
// (from the "Curefoods RIDs" sheet); the others show nothing until theirs are imported.
export const BRANDS = ["Cake Zone", "Olio", "EatFit"];

// rid = the res-id column on timing_stores; connected = its "reachable by our login" flag.
export const PLATFORMS = [
  { name: "Swiggy", rid: "s_res_id", connected: "s_connected", logo: swiggyLogo },
  { name: "Zomato", rid: "z_res_id", connected: "z_connected", logo: zomatoLogo },
  { name: "Ownly", rid: "o_res_id", connected: null, logo: ownlyLogo },
  { name: "Flipkart", rid: "f_res_id", connected: null, logo: flipkartLogo },
];
export const PLATFORM_NAMES = PLATFORMS.map(p => p.name);
export const platformByName = Object.fromEntries(PLATFORMS.map(p => [p.name, p]));

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// "BLR_AUD_EatFit" → "BLR AUD EatFit"
export function storeTitle(s) {
  return (s.urbanpiper_store || `${s.kitchen} ${s.sub_brand_name}`).replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}
