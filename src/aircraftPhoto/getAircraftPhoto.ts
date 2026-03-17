import type { AircraftPhoto } from './airportData';
import { AIRCRAFT_PHOTO_USE_AIRPORT_DATA, AIRCRAFT_PHOTO_USE_JETPHOTOS } from '../constants';
import { getAirportDataPhoto } from './airportData';
import { getJetPhotosPhoto } from './jetphotos';

export async function getAircraftPhoto(hex: string, registration: string | null): Promise<AircraftPhoto | null> {
    // Prefer JetPhotos when enabled and we have a registration, since results are higher quality and richer.
    if (AIRCRAFT_PHOTO_USE_JETPHOTOS && registration) {
        const jet = await getJetPhotosPhoto(registration);
        if (jet) return jet;
    }

    if (AIRCRAFT_PHOTO_USE_AIRPORT_DATA) {
        return getAirportDataPhoto(hex);
    }

    return null;
}

