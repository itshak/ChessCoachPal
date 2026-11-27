// The working product prototype is the default. Historical comparison remains reproducible.
if(new URLSearchParams(location.search).get("lab")==="1")import("./comparison.jsx");
else import("./prototype.jsx");
