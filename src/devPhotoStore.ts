/**
 * Dev-only: carries locally-picked photo URIs from the New Memory wizard
 * into the Memory Event screen for visual flow testing.
 * Photos are never uploaded — they live in memory only and clear on use.
 */
let pendingPhotos: string[] = [];

export const setPendingPhotos = (photos: string[]) => {
  pendingPhotos = photos;
};

export const consumePendingPhotos = (): string[] => {
  const photos = pendingPhotos;
  pendingPhotos = [];
  return photos;
};
