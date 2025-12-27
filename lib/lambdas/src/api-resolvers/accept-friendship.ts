import { AppSyncResolverHandler } from 'aws-lambda';

interface AcceptFriendshipArgs {
  friendshipId: string;
  acceptingUserId: string;
}

interface AcceptFriendshipResult {
  success: boolean;
  friendship?: any;
  error?: string;
}

/**
 * Accept a friend request and trigger retroactive face matching
 *
 * Flow:
 * 1. Validate friendship exists and is pending
 * 2. Update friendship status to accepted
 * 3. Invoke RetroactiveMatchFunction to match unknown faces
 * 4. Return updated friendship
 */
export const handler: AppSyncResolverHandler<AcceptFriendshipArgs, AcceptFriendshipResult> = async (event) => {
  console.log('AcceptFriendship invoked', JSON.stringify(event, null, 2));

  const { friendshipId, acceptingUserId } = event.arguments;

  // TODO: Implement accept friendship logic
  // - Get friendship from DynamoDB
  // - Validate status = PENDING and user2 = acceptingUserId
  // - Update status to ACCEPTED
  // - Invoke RetroactiveMatchFunction with userId1, userId2, friendshipId
  // - Return updated friendship

  return {
    success: true,
    friendship: { id: friendshipId, status: 'ACCEPTED' },
  };
};
