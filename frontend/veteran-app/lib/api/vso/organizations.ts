/**
 * Fixed catalog backing the VSO sign-in form's organization picker
 * (app/(vso)/vso/signin/page.tsx). Real, VA-recognized accredited veterans
 * service organizations -- chosen so the dropdown reads as a credible
 * accreditation list rather than placeholder text, even though (per this
 * app's simulated-auth posture) nothing here is validated against the VA's
 * actual accreditation database. Wounded Warrior Project was dropped from
 * an earlier draft of this list: it isn't one of VA's nationally recognized
 * claims-accredited VSOs the way the other ten are, so it would have read
 * as wrong to anyone who actually knows this space. Fleet Reserve
 * Association takes its place.
 */
export const VSO_ORGANIZATIONS: readonly string[] = [
  "Disabled American Veterans (DAV)",
  "Veterans of Foreign Wars (VFW)",
  "The American Legion",
  "Paralyzed Veterans of America (PVA)",
  "AMVETS",
  "Military Order of the Purple Heart",
  "Vietnam Veterans of America (VVA)",
  "Fleet Reserve Association (FRA)",
  "National Association of County Veterans Service Officers (NACVSO)",
  "Blinded Veterans Association (BVA)",
];
