import {CONFIG_GIT_URL_UNAVAILABLE} from "../../../constants/error-messages";
import {logger} from '../../../logger';
import * as hostRules from '../../../util/host-rules';
import {joinUrlParts} from '../../../util/url';
import type {SpaceCodeReviewState, SpaceMergeRequestRecord} from "./types";
import type {Pr} from "../types";
import {hashBody} from "../pr-body";
import type {PrState} from "../../../types";

export const TAG_PULL_REQUEST_BODY = 'pull-request';

export function getSpaceRepoUrl(repository: string, endpoint: string): string {
  logger.debug(`getSpaceRepoUrl: repository=${repository}, endpoint=${endpoint}`);

  if (!endpoint.endsWith('.jetbrains.space')) {
    logger.debug('SPACE: invalid endpoint, it must looks like my-org-name.jetbrains.space')
    throw Error(CONFIG_GIT_URL_UNAVAILABLE)
  }

  if (repository.indexOf('/') === -1) {
    throw Error('Init: repository name must include project key, like my-project/my-repo (default project key is "main")')
  }

  // endpoint looks like <orgname>.jetbrains.space, picking the first part
  const orgName = endpoint.split('.')[0]

  const opts = hostRules.find({
    hostType: 'space',
    url: endpoint,
  });

  const url = new URL('https://git.jetbrains.space');
  if (!opts.token) {
    throw new Error('Init: You must configure a JetBrains Space token');
  }
  url.username = 'username-doesnt-matter';
  url.password = opts.token;
  url.pathname = joinUrlParts(
    orgName,
    repository
  );

  logger.debug(
    { url: url.toString() },
    'using URL based on configured endpoint',
  );
  return url.toString();
}

export function mapSpaceCodeReviewDetailsToPr(details: SpaceMergeRequestRecord, body: string): Pr {
  return {
    number: details.number,
    state: mapSpaceCodeReviewStateToPrState(details.state, details.canBeReopened ?? false),
    sourceBranch: details.branchPairs[0].sourceBranch,
    targetBranch: details.branchPairs[0].targetBranch,
    title: details.title,
    // TODO: add reviewers retrieval
    // reviewers:
    //   change.reviewers?.REVIEWER?.filter(
    //     (reviewer) => typeof reviewer.username === 'string',
    //   ).map((reviewer) => reviewer.username!) ?? [],
    bodyStruct: {
      hash: hashBody(body),
    },
  };
}

function mapSpaceCodeReviewStateToPrState(state: SpaceCodeReviewState, canBeReopened: boolean): PrState {
  switch (state) {
    case 'Opened':
      return 'open';
    case 'Closed':
      if (canBeReopened) {
        return 'closed';
      } else {
        return 'merged';
      }
    case "Deleted":
      // should not normally reach here
      return 'closed';
    default:
      return 'all'
  }
}
