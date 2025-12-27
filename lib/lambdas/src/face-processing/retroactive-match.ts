import { Handler } from 'aws-lambda';

interface RetroactiveMatchEvent {
  userId1: string;
  userId2: string;
  friendshipId: string;
}

/**
 * Retroactively match unknown faces when friendship is accepted
 *
 * Flow:
 * 1. Find all unknown ContentFace records for both users
 * 2. For each unknown face, search Rekognition collection again
 * 3. If match found with new friend, update ContentFace to matched
 * 4. Create RecipientEdge for newly matched content
 */
export const handler: Handler<RetroactiveMatchEvent, void> = async (event) => {
  console.log('RetroactiveMatch invoked', JSON.stringify(event, null, 2));

  const { userId1, userId2, friendshipId } = event;

  // TODO: Implement retroactive matching logic
  // - Query ContentFace for unknown faces owned by userId1
  // - Query ContentFace for unknown faces owned by userId2
  // - For each unknown face: SearchFaces in Rekognition
  // - If match found with new friend's faceId:
  //   - Update ContentFace to matched
  //   - Create RecipientEdge

  return;
};
