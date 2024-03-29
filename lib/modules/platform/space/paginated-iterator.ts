import {logger} from "../../../logger";
import type {SpaceHttp} from "../../../util/http/space";

/**
 * Asynchronous iterator that can perform some extra operations over received data as it is fetched
 */
export class PaginatedIterable<T> implements AsyncIterable<T[]> {

  constructor(private nextPage: (next?: string) => Promise<any>, private config: PaginatedIterableConfig) {

  }

  [Symbol.asyncIterator](): AsyncIterator<T[]> {
    return new PaginatedIterator(this.nextPage, this.config)
  }

  static fromGetUsingNext<T>(http: SpaceHttp, basePath: string): PaginatedIterable<T> {
    return this.fromUsing(http, basePath, {
      queryParameter: 'next',
      dataField: 'data',
      nextField: 'next'
    })
  }

  static fromGetUsingSkip<T>(http: SpaceHttp, basePath: string): PaginatedIterable<T> {
    return this.fromUsing(http, basePath, {
      queryParameter: '$skip',
      dataField: 'data',
      nextField: 'next'
    })
  }

  static fromUsing<T>(http: SpaceHttp, basePath: string, config: PaginatedIterableConfig): PaginatedIterable<T> {
    const hasQuery = basePath.includes('?')

    const encodedQueryParameter = encodeURIComponent(config.queryParameter)

    return new PaginatedIterable<T>(async (next?: string) => {
      logger.debug(`SPACE: iterating over ${basePath} with next=${next}`)

      let path = basePath
      if (next) {
        const encodedNext = encodeURIComponent(next)
        if (hasQuery) {
          path += `&${encodedQueryParameter}=${encodedNext}`
        } else {
          path += `?${encodedQueryParameter}=${encodedNext}`
        }
      }

      const result = await http.getJson<any>(path)
      logger.debug(`SPACE: from ${path} and next ${next} got ${JSON.stringify(result.body.data)}`)

      return result.body
    }, config)
  }

  async findFirst(predicate: (value: T) => boolean): Promise<T | undefined> {
    return await this.findFirstAsync(it => Promise.resolve(predicate(it)))
  }

  async findFirstAsync(predicate: (value: T) => Promise<boolean>): Promise<T | undefined> {
    for await (const page of this) {
      for (const element of page) {
        if (await predicate(element)) {
          return element
        }
      }
    }
  }

  async flatMapNotNull<R>(mapper: (value: T) => Promise<R | undefined>, limit?: number): Promise<R[]> {
    const result: R[] = []

    for await (const page of this) {
      for (const element of page) {
        const mapped = await mapper(element)
        if (mapped) {
          result.push(mapped)
        }

        if (limit && result.length >= limit) {
          return result
        }
      }
    }

    return result
  }


  all(): Promise<T[]> {
    return this.flatMapNotNull(it => Promise.resolve(it))
  }
}

class PaginatedIterator<T> implements AsyncIterator<T[]> {

  private nextQuery?: string = undefined

  constructor(private nextPage: (next?: string) => Promise<any>, private config: PaginatedIteratorConfig) {

  }

  async next(): Promise<IteratorResult<T[]>> {
    const result = await this.nextPage(this.nextQuery)

    this.nextQuery = result[this.config.nextField]

    const data = result[this.config.dataField] as T[]
    return Promise.resolve({
      value: data,
      done: data.length === 0
    })
  }
}

interface PaginatedIterableConfig extends PaginatedIteratorConfig{
  queryParameter: string;
}

interface PaginatedIteratorConfig {
  nextField: string;
  dataField: string;
}
