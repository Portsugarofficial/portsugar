/* PortSugar GA4: intentionally restricted to the official .com domain.
   Set GA4_MEASUREMENT_ID to the Measurement ID for the PortSugar-owned GA4 web stream.
   Do not put secrets or private credentials here. */
(function () {
  "use strict";
  var hostname = window.location.hostname.toLowerCase();
  if (hostname !== "portsugar.com" && hostname !== "www.portsugar.com") return;

  var GA4_MEASUREMENT_ID = ""; // TODO: insert the PortSugar GA4 Measurement ID (format: G-XXXXXXXXXX).
  if (!/^G-[A-Z0-9]+$/.test(GA4_MEASUREMENT_ID)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA4_MEASUREMENT_ID, { send_page_view: true, cookie_domain: "auto" });

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA4_MEASUREMENT_ID);
  document.head.appendChild(script);

  window.portSugarTrackLeadSuccess = function () {
    if (typeof window.gtag === "function") {
      window.gtag("event", "generate_lead", {
        event_category: "contact",
        event_label: "successful_supplier_enquiry",
        transport_type: "beacon"
      });
    }
  };
})();