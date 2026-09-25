<?php
/* Casa Nina Flamingo — server configuration for php/availability.php.
 *
 * This is the EXAMPLE. The real file lives OUTSIDE the web root on the host at
 *   /home/<user>/config/casa-nina.php
 * and is never committed (config/*.php is git-ignored; only this example is
 * allowed through). Copy this file there and replace the placeholders.
 *
 * The Airbnb iCal URLs carry a private token: treat them like passwords.
 */
return [
    /* One entry per Airbnb listing. Full Casa now; add the Half Casa listing
       when the client says so. Order does not matter; ranges are merged. */
    'airbnb_ical_urls' => [
        'https://www.airbnb.com/calendar/ical/LISTING_ID.ics?s=SECRET_TOKEN',
    ],

    /* Writable directory, outside the web root, where each feed's raw .ics is
       cached for 60 minutes. Create it once:  mkdir -p /home/<user>/cache */
    'cache_dir' => '/home/<user>/cache',
];
