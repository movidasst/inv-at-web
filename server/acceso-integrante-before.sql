CREATE OR REPLACE FUNCTION public.acceso_integrante(p_cedula text, p_codigo text)
 RETURNS TABLE(cedula text, nombres text, apellidos text, edad integer, genero text, estado text, municipio text, grado text, carrera text, postgrado text, wasap text, mostrar_wasap boolean, correo text, laboral text, foto_url text, doctorado text, linkedin text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    i.cedula,
    i.nombres,
    i.apellidos,
    i.edad,
    i.genero,
    i.estado,
    i.municipio,
    i.grado,
    i.carrera,
    i.postgrado,
    i.wasap,
    i.mostrar_wasap,
    i.correo,
    i.laboral,
    i.foto_url,
    i.doctorado,
    i.linkedin

  from public.integrantes as i

  where
    i.cedula =
      regexp_replace(
        coalesce(p_cedula, ''),
        '\D',
        '',
        'g'
      )

    and upper(
      btrim(
        coalesce(i.codigo_integrante, '')
      )
    )
    =
    upper(
      btrim(
        coalesce(p_codigo, '')
      )
    )

  limit 1;
$function$
