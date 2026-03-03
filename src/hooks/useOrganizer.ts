import { useSyncExternalStore } from "react";
import { Organizer, OrganizerState } from "@/services/OrganizerService";

export function useOrganizer(): OrganizerState {
    return useSyncExternalStore(
        Organizer.subscribe,
        Organizer.get,
        Organizer.get
    );
}
