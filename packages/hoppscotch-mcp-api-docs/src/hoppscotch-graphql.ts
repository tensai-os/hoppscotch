const IMPORT_MUTATION = `
mutation ImportUserCollectionsFromJSON(
  $jsonString: String!
  $reqType: ReqType!
  $parentCollectionID: ID
) {
  importUserCollectionsFromJSON(
    jsonString: $jsonString
    reqType: $reqType
    parentCollectionID: $parentCollectionID
  ) {
    exportedCollection
    collectionType
  }
}
`;

export type HoppscotchPublishConfig = {
  graphqlUrl: string;
  accessToken: string;
};

export async function importCollectionsToHoppscotch(
  cfg: HoppscotchPublishConfig,
  params: {
    jsonString: string;
    reqType: 'REST' | 'GQL';
    parentCollectionID?: string | null;
  },
): Promise<unknown> {
  const res = await fetch(cfg.graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    body: JSON.stringify({
      query: IMPORT_MUTATION,
      variables: {
        jsonString: params.jsonString,
        reqType: params.reqType,
        parentCollectionID: params.parentCollectionID ?? null,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const body = (await res.json()) as {
    errors?: { message: string }[];
    data?: { importUserCollectionsFromJSON?: unknown };
  };

  if (!res.ok) {
    throw new Error(`Hoppscotch HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  if (body.errors?.length) {
    throw new Error(`GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  return body.data?.importUserCollectionsFromJSON;
}
