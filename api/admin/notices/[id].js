import { handleInstructorResource } from '../../../src/instructor-api.mjs';

export default function handler(req, res) {
  return handleInstructorResource(req, res, 'edit_notice');
}
