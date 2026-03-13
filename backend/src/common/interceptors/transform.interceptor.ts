import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: any;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the data already has the ApiResponse shape, pass through
        if (data && typeof data === 'object' && 'success' in data && 'timestamp' in data) {
          return data;
        }

        // Extract message if the response is { message: '...' }
        let message: string | null = null;
        let responseData: any = data;

        if (data && typeof data === 'object' && 'message' in data) {
          message = data.message;
          // If only message field, set data to null
          const keys = Object.keys(data);
          if (keys.length === 1 && keys[0] === 'message') {
            responseData = null;
          }
        }

        return {
          success: true,
          message,
          data: responseData,
          errors: null,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
