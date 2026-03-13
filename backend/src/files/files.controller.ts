import {
  Controller,
  Post,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileStorageService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private fileStorageService: FileStorageService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.fileStorageService.uploadFile(file);
  }

  @Post('upload/avatar')
  @ApiOperation({ summary: 'Upload an avatar image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    return this.fileStorageService.uploadAvatar(file);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a file' })
  deleteFile(@Query('fileName') fileName: string) {
    return this.fileStorageService.deleteFile(fileName);
  }
}
