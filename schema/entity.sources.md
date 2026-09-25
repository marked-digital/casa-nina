# Where each value in schema/entity.json comes from

Every value is copied from visible page copy or from an attribute the page already carries. Nothing is invented. Check any line against the page named.

## #vacationrental (VacationRental)

| property | value | source |
|---|---|---|
| name | Casa Nina Flamingo | site header logo alt and page titles, every page |
| url | https://casaninaflamingo.com/ | homepage canonical |
| description | "Casa Nina Flamingo is a newly built three-storey villa above Playa Flamingo…" | index.html, the first descriptive paragraph under the film (the entity statement), verbatim |
| image[0] | images/home-hero-villa-pool.jpg (2000×1412, 3:2) | index.html hero photo; the primary photo of the villa |
| image[1] | images/gallery-exterior-03.jpg (2000×1500, 4:3) | gallery.html, Exterior & arrival; the only 4:3 photo of the villa itself |
| image, 16:9 | **none available**: the only 16:9 files on the site are Explore's beach and activity photos, none of the villa. Not cropped, per the brief. | |
| image, 1:1 | **none available**: the only square file is Explore's Playa Flamingo beach photo (640×640), not the villa. Not cropped. | |
| address | Playa Flamingo, Guanacaste, CR | footer on every page ("Playa Flamingo, Costa Rica") and book.html contact ledger ("Playa Flamingo, Guanacaste, Costa Rica"). No page prints a street address, so streetAddress is omitted. |
| geo | 10.428825, -85.790987 | geo.position and ICBM meta tags on every page; the Google listing pin |
| hasMap | https://maps.google.com/?cid=1469512052654509312 | explore.html, the "Open in Google Maps" link beside the map |
| telephone | +16473284929 | footer on every page, "WhatsApp +1 647 328 4929", written in E.164 |
| email | info@casaninaflamingo.com | footer on every page |
| sameAs | Instagram, YouTube, TikTok | footer "Reach Us" strip on every page |
| sameAs | https://www.airbnb.ca/rooms/553696885568872196 | book.html, the only Airbnb link on the page (both cards and the bottom band point at it). The second listing that used to appear on the homepage's JSON-LD is not linked from any page, so it is dropped. |
| numberOfRooms | 7 | the-casa.html amenities, "7 bedrooms / 6 bathrooms"; book.html Full Casa card |
| checkinTime / checkoutTime | 15:00 / 10:00 | faq.html, "What are check-in and check-out times?": "Check-in is from 3:00 PM and check-out is by 10:00 AM." |
| amenityFeature (24 items) | verbatim list | the-casa.html amenities checklist, all three groups (The property, Indoor living, Services), in page order, HTML entities decoded |
| containsPlace | #full-casa, #half-casa | book.html, the two booking cards |
| makesOffer (4 Offers) | book direct → book.html; Airbnb → the listing, for each of #full-casa and #half-casa (itemOffered) | book.html card buttons "Check availability", "Book on Airbnb" and "View on Airbnb". No price, per the rules. The Offers sit on the VacationRental rather than on the Accommodation nodes because schema.org does not define `offers` for Accommodation; `makesOffer` is defined for every Organization, which a VacationRental is. |
| slogan | **omitted** | no single tagline appears on every page; each hero has its own subtitle |

## #full-casa (Accommodation)

| property | value | source |
|---|---|---|
| name | Full Casa | book.html card title |
| description | "Everyone you love, under one roof. 7 Bedrooms · 6 Bathrooms. Sleeps up to 14 guests. …" | book.html Full Casa card: its subtitle followed by its five detail lines, joined with full stops. There is no prose paragraph for the Full Casa on the page. |
| numberOfBedrooms / numberOfBathroomsTotal | 7 / 6 | book.html card |
| occupancy maxValue | 14 | book.html card, "Sleeps up to 14 guests" |

## #half-casa (Accommodation)

| property | value | source |
|---|---|---|
| name | Half Casa | book.html card title |
| description | "A three-bedroom home on the first floor with its own kitchen, living space and entrance…" | book.html, "Good to know" → "The Half Casa is private", verbatim |
| numberOfBedrooms / numberOfBathroomsTotal | 3 / 2.5 | book.html card |
| occupancy minValue / maxValue | 4 / 6 | book.html card, "Sleeps 4 to 6 guests" |

## #availability (ReserveAction)

| property | value | source |
|---|---|---|
| target.urlTemplate | https://casaninaflamingo.com/book.html#availability | the "Check availability" buttons across the site link here |
| result | LodgingReservation "Stay at Casa Nina Flamingo" | kept from the existing book.html markup |

## #website (WebSite)

name and url as above; publisher → #vacationrental; inLanguage en (the `<html lang="en">` attribute). No SearchAction: the site has no search.

## #film (VideoObject)

| property | value | source |
|---|---|---|
| name, description | as in the existing markup | kept from the existing index.html JSON-LD; the visible film section carries only the title "Bring everyone. There is room." |
| thumbnailUrl | images/home-film-poster-dusk.jpg | the poster image on the film player, index.html and gallery.html |
| embedUrl | https://www.youtube.com/embed/lwvIslSuoEo | the `data-youtube-id` on the film player; the generator asserts it matches on both pages |
| uploadDate | 2026-09-15 | kept from the existing markup |

## #destination (TouristDestination, explore.html only)

name "Playa Flamingo" from the Explore hero title; description from the hero's descriptive line, verbatim; contained in Guanacaste, Costa Rica from the hero subtitle "Costa Rica's Gold Coast" and the geo meta tags.
